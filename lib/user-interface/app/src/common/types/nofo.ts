/**
 * NOFO (Notice of Funding Opportunity) types and constants.
 *
 * Canonical location for grant-related type definitions used across
 * the dashboard, landing page, and grants table.
 */

export type GrantTypeId = "federal" | "state" | "quasi" | "philanthropic" | "unknown";

export interface NOFO {
  id: number;
  name: string;
  status: "active" | "archived";
  isPinned?: boolean;
  expirationDate?: string | null;
  grantType?: GrantTypeId | null;
  agency?: string | null;
  category?: string | null;
}

export const GRANT_TYPES: Record<GrantTypeId, { label: string; color: string }> = {
  federal: { label: "Federal", color: "#1a4480" },
  state: { label: "State", color: "#2e8540" },
  quasi: { label: "Quasi", color: "#8168b3" },
  philanthropic: { label: "Philanthropic", color: "#e66f0e" },
  unknown: { label: "Unknown", color: "#6b7280" },
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
