import type { Branding, HomeCopy, RichLine } from "./branding";

/** branding.home with every default filled in. Pure, so the Vite build can render the static fallback from it. */
export type ResolvedHome = Required<Omit<HomeCopy, "layout">> & { layout: "state" | "marketing" };

export const DEFAULT_TAGLINE = "Find and apply for state and federal grants";

export function resolveHome(branding: Branding, singleStateName: string | null): ResolvedHome {
  const home = branding.home ?? {};
  const { appName, supportEmail, footer } = branding;
  const madeBy = footer.madeBy?.label && footer.madeBy.href ? footer.madeBy : undefined;
  const attribution: RichLine[] = [
    ...(madeBy ? [["Developed by ", { label: madeBy.label, href: madeBy.href }, "."]] : []),
    ...(supportEmail ? [["Questions? Contact ", { label: supportEmail, href: `mailto:${supportEmail}` }]] : []),
  ];
  return {
    layout: home.layout ?? (singleStateName ? "state" : "marketing"),
    tagline: home.tagline ?? DEFAULT_TAGLINE,
    description:
      home.description ??
      `${appName} helps ${singleStateName ? `${singleStateName} ` : ""}organizations discover, understand, and draft applications for state and federal grants.`,
    features: home.features ?? [
      { title: "Discover", text: "Search for state and federal funding opportunities that fit your community's needs." },
      { title: "Understand", text: "See each grant's key requirements and ask questions about eligibility in chat." },
      { title: "Draft", text: "Get step-by-step help drafting your application, with AI support along the way." },
    ],
    trust: home.trust ?? {
      title: "AI-powered, with you in control",
      text: `${appName} uses AI as a support tool, not a decision-maker. Answers are grounded in the official grant documents, and the system is designed not to invent requirements or facts. Every draft needs human review before you submit it.`,
    },
    attribution: home.attribution ?? attribution,
  };
}
