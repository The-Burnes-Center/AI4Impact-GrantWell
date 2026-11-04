import type { ChatCitation } from "./types";

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  data?: { hName?: string; hProperties?: Record<string, string> };
}

/** Citations saved with a reply, or none when the metadata holds something else. */
export function citationsOf(metadata: Record<string, unknown> | undefined): ChatCitation[] {
  const list = metadata?.Citations;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (c): c is ChatCitation =>
      !!c && typeof c.n === "number" && Array.isArray(c.at) && typeof c.quote === "string" && typeof c.document === "string"
  );
}

/** "Grant document, page 12", "board.pdf, pages 3–4" or just the document. */
export function citationSource(c: ChatCitation): string {
  if (!c.page) return c.document;
  return c.lastPage && c.lastPage > c.page ? `${c.document}, pages ${c.page}–${c.lastPage}` : `${c.document}, page ${c.page}`;
}

function textNodes(tree: MdNode): MdNode[] {
  const out: MdNode[] = [];
  const walk = (node: MdNode) => {
    if (node.type === "text" && node.position?.start.offset !== undefined) out.push(node);
    node.children?.forEach(walk);
  };
  walk(tree);
  return out;
}

function localIndex(node: MdNode, at: number): number {
  const value = node.value ?? "";
  const start = node.position!.start.offset!;
  const end = node.position!.end.offset ?? start + value.length;
  if (at >= end) return value.length;
  return Math.max(0, Math.min(value.length, at - start));
}

/**
 * A remark plugin that puts a `<sup data-cite="1 2">` after the text each citation covers. Offsets are
 * into the markdown source; a marker goes into the last plain text that starts before it, so code
 * spans never get one.
 */
export function remarkCitationMarkers(citations: ChatCitation[]) {
  return () => (tree: MdNode) => {
    const texts = textNodes(tree);
    if (!texts.length || !citations.length) return;
    const byOffset = new Map<number, number[]>();
    for (const c of citations) for (const at of c.at) byOffset.set(at, [...(byOffset.get(at) ?? []), c.n]);

    const inserts = new Map<MdNode, Array<{ index: number; ns: number[] }>>();
    for (const [at, ns] of byOffset) {
      let target: MdNode | undefined;
      for (const node of texts) if (node.position!.start.offset! < at) target = node;
      target ??= texts[0];
      const list = inserts.get(target) ?? [];
      list.push({ index: localIndex(target, at), ns: [...ns].sort((a, b) => a - b) });
      inserts.set(target, list);
    }

    const split = (node: MdNode): MdNode[] => {
      const value = node.value ?? "";
      const out: MdNode[] = [];
      let from = 0;
      for (const { index, ns } of inserts.get(node)!.sort((a, b) => a.index - b.index)) {
        if (index > from) out.push({ type: "text", value: value.slice(from, index) });
        out.push({ type: "citationMarker", data: { hName: "sup", hProperties: { dataCite: ns.join(" ") } } });
        from = index;
      }
      if (from < value.length) out.push({ type: "text", value: value.slice(from) });
      return out;
    };
    const rebuild = (node: MdNode) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child) => (inserts.has(child) ? split(child) : [child]));
      node.children.forEach(rebuild);
    };
    rebuild(tree);
  };
}
