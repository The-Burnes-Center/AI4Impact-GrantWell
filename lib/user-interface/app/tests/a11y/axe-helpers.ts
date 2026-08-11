import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

export const WCAG_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const;

interface AxeNode {
  target: unknown[];
  failureSummary?: string;
}

interface AxeViolation {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl: string;
  nodes: AxeNode[];
}

interface AxeScanResult {
  violations: AxeViolation[];
  incomplete: AxeViolation[];
}

export async function scanPage(
  page: Page,
  options: { disableRules?: string[] } = {}
): Promise<AxeScanResult> {
  let builder = new AxeBuilder({ page }).withTags([...WCAG_TAGS]);
  if (options.disableRules?.length) {
    builder = builder.disableRules(options.disableRules);
  }
  const results = await builder.analyze();
  return {
    violations: results.violations as unknown as AxeViolation[],
    incomplete: results.incomplete as unknown as AxeViolation[],
  };
}

export function describeViolations(violations: AxeViolation[]): string {
  if (violations.length === 0) return "no violations";
  return violations
    .map((v) => {
      const targets = v.nodes
        .slice(0, 5)
        .map((n) => JSON.stringify(n.target))
        .join(", ");
      const more = v.nodes.length > 5 ? ` (+${v.nodes.length - 5} more)` : "";
      return `[${v.impact ?? "unknown"}] ${v.id}: ${v.help}\n    ${targets}${more}\n    ${v.helpUrl}`;
    })
    .join("\n");
}
