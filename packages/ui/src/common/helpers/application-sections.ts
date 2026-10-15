/**
 * Narrative section identity on the client. An application keys its section text by section id
 * and keeps `sectionOrder` ([{id, name}]) beside it; the id rules mirror grantwell-shared's
 * sections.mjs. Applications saved before ids existed are keyed by name and are read through
 * resolveApplicationSections, which maps them onto the grant's ids.
 */

export interface SectionRef {
  id: string;
  name: string;
}

export interface ApplicationSection extends SectionRef {
  description: string;
  /** Added by the applicant rather than listed by the grant. */
  custom?: boolean;
}

export const CUSTOM_SECTION_PREFIX = "custom-";

const MAX_SLUG_LENGTH = 64;

export function sectionSlug(name: string | null | undefined): string {
  const slug = String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return slug || "section";
}

export function uniqueSectionId(base: string, used: Set<string>): string {
  let id = base;
  for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
  used.add(id);
  return id;
}

interface GrantSectionInput {
  id?: unknown;
  item?: string;
  description?: string;
}

/** The grant's narrative sections, in order, each with a unique id. */
export function grantSections(items: unknown): ApplicationSection[] {
  if (!Array.isArray(items)) return [];
  const list = items as GrantSectionInput[];
  const used = new Set<string>();
  const kept = list.map((entry) => {
    const id = typeof entry?.id === "string" && entry.id.trim() !== "" ? entry.id.trim() : null;
    if (!id || used.has(id)) return null;
    used.add(id);
    return id;
  });
  return list.map((entry, index) => ({
    id: kept[index] ?? uniqueSectionId(sectionSlug(entry?.item), used),
    name: entry?.item || "Untitled section",
    description: entry?.description || "",
  }));
}

export interface ResolvedSections {
  sections: ApplicationSection[];
  answers: Record<string, string>;
  /** True when the stored application was keyed by name and has text to carry over. */
  converted: boolean;
}

/**
 * The sections an application shows, in order: the grant's, then the applicant's own and any
 * the grant no longer lists that still hold text.
 */
export function resolveApplicationSections(
  grant: ApplicationSection[],
  stored: Record<string, string> | null | undefined,
  storedOrder: SectionRef[] | null | undefined
): ResolvedSections {
  const text = stored ?? {};
  const grantIds = new Set(grant.map((s) => s.id));
  let answers: Record<string, string>;
  let order: SectionRef[];
  let converted = false;

  if (Array.isArray(storedOrder)) {
    answers = { ...text };
    order = storedOrder.filter((ref) => ref && typeof ref.id === "string");
  } else {
    answers = {};
    order = [];
    const used = new Set<string>();
    const byName = new Map<string, string>();
    const bySlug = new Map<string, string>();
    for (const s of grant) {
      if (!byName.has(s.name)) byName.set(s.name, s.id);
      const slug = sectionSlug(s.name);
      if (!bySlug.has(slug)) bySlug.set(slug, s.id);
    }
    for (const [name, value] of Object.entries(text)) {
      let id = grantIds.has(name) ? name : byName.get(name);
      if (!id || used.has(id)) id = bySlug.get(sectionSlug(name));
      if (!id || used.has(id)) {
        id = uniqueSectionId(sectionSlug(name), new Set([...used, ...grantIds]));
        order.push({ id, name });
      }
      used.add(id);
      answers[id] = value;
    }
    converted = Object.keys(text).length > 0;
  }

  const extras: ApplicationSection[] = [];
  const seen = new Set(grantIds);
  for (const ref of order) {
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);
    const custom = ref.id.startsWith(CUSTOM_SECTION_PREFIX);
    if (!custom && !(answers[ref.id] ?? "").trim()) continue;
    extras.push({ id: ref.id, name: ref.name || ref.id, description: "", custom: custom || undefined });
  }

  return { sections: [...grant, ...extras], answers, converted };
}

export function sectionOrderOf(sections: ApplicationSection[]): SectionRef[] {
  return sections.map(({ id, name }) => ({ id, name }));
}

/** An id for `key`, which is an id or (from an older job or version row) a section name. */
export function toSectionId(key: string, sections: SectionRef[]): string | undefined {
  if (sections.some((s) => s.id === key)) return key;
  return sections.find((s) => s.name === key)?.id;
}

/** `entries` re-keyed by section id; keys that match no section are dropped. */
export function keyedById<T>(entries: Record<string, T> | null | undefined, sections: SectionRef[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(entries ?? {})) {
    const id = toSectionId(key, sections);
    if (id) out[id] = value;
  }
  return out;
}

export function newCustomSectionId(name: string, sections: SectionRef[]): string {
  return uniqueSectionId(`${CUSTOM_SECTION_PREFIX}${sectionSlug(name)}`, new Set(sections.map((s) => s.id)));
}

/** The sections that have text, with their order, as the exporters take them. */
export function exportSections(sections: ApplicationSection[], answers: Record<string, string>) {
  const written = sections.filter((s) => (answers[s.id] ?? "").trim() !== "");
  return {
    sections: Object.fromEntries(written.map((s) => [s.id, answers[s.id]])),
    sectionOrder: sectionOrderOf(written),
  };
}
