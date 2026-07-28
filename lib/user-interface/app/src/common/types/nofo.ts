/**
 * NOFO (Notice of Funding Opportunity) types and constants.
 *
 * Canonical location for grant-related type definitions used across
 * the dashboard, landing page, and grants table.
 */

export type GrantTypeId = "federal" | "state" | "quasi" | "philanthropic";

/**
 * An admin-authored questionnaire question layered onto a state NOFO, for grants whose document
 * doesn't spell out the questions an agency wants applicants to answer. `id` is server-controlled
 * (`custom_<uuid>`) and may be omitted when adding a new question.
 */
export interface CustomQuestion {
  id?: string;
  question: string;
  helpText?: string;
}

/**
 * Advisory flag on a live grant that auto-published with an incomplete extraction
 * (1-2 sections missing). The grant is active; the flag marks it for optional review.
 */
export interface ReviewFlag {
  reason: string;
  missingCategories: string[];
  flaggedAt?: string;
}

export interface NOFO {
  id: number;
  name: string;
  status: "active" | "archived";
  isPinned?: boolean;
  isRolling?: boolean;
  expirationDate?: string | null;
  grantType?: GrantTypeId | null;
  /** Authorization scope: "federal" (all states) or "state" (owned by `state`). */
  scope?: "federal" | "state" | null;
  /** Two-letter state code this NOFO belongs to when `scope === "state"`. */
  state?: string | null;
  agency?: string | null;
  category?: string | null;
  processingStatus?: string | null;
  reviewFlag?: ReviewFlag | null;
  createdAt?: string | null;
  /** Set when the pipeline finished; drives the "recently finished" state in the Processing tab. */
  processingCompletedAt?: string | null;
  /** How the pipeline finished: "published" (live) or "needs_review" (failed/quarantined). */
  processingOutcome?: "published" | "needs_review" | null;
}

export const GRANT_TYPES: Record<GrantTypeId, { label: string; color: string }> = {
  federal: { label: "Federal", color: "#1a4480" },
  state: { label: "State", color: "#2b7d3c" },
  quasi: { label: "Quasi", color: "#7962a8" },
  philanthropic: { label: "Philanthropic", color: "#af540b" },
};

export const GRANT_CATEGORIES = [
  "Recovery Act",
  "Agriculture",
  "Arts",
  "Business and Commerce",
  "Community Development",
  "Consumer Protection",
  "Disaster Prevention and Relief",
  "Education",
  "Employment, Labor, and Training",
  "Energy",
  "Energy Infrastructure and Critical Mineral and Materials (EICMM)",
  "Environment",
  "Food and Nutrition",
  "Health",
  "Housing",
  "Humanities",
  "Information and Statistics",
  "Infrastructure Investment and Jobs Act",
  "Income Security and Social Services",
  "Law, Justice, and Legal Services",
  "Natural Resources",
  "Opportunity Zone Benefits",
  "Regional Development",
  "Science, Technology, and Other Research and Development",
  "Transportation",
  "Affordable Care Act",
] as const;
