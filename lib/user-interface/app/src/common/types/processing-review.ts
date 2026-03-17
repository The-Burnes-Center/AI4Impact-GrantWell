export interface ValidationIssue {
  severity: "critical" | "warning" | "info";
  category: "missing_field" | "hallucination" | "inaccuracy" | "incomplete";
  field: string;
  description: string;
  suggestedFix: string;
}

export interface MissingItem {
  field: string;
  description: string;
}

export interface ValidationResult {
  overallVerdict: "PASS" | "FAIL" | "NEEDS_REVIEW";
  qualityScore: number;
  issues: ValidationIssue[];
  missingItems: MissingItem[];
}

export interface IssueCount {
  critical: number;
  warning: number;
  info: number;
}

export interface ReviewItem {
  nofo_name: string;
  review_id: string;
  status: "pending_review" | "approved" | "rejected" | "failed" | "reprocessing";
  created_at: string;
  qualityScore: number;
  retryCount: number;
  source: "pipeline" | "dlq";
  errorMessage: string | null;
  issueCount: IssueCount;
}

export interface ReviewDetail extends ReviewItem {
  extractedSummary: Record<string, unknown> | null;
  extractedQuestions: Record<string, unknown> | null;
  validationResult: ValidationResult | null;
  s3DocumentKey: string;
  s3RawTextKey: string;
  documentTextPreview: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notes: string | null;
  corrections: Record<string, unknown> | null;
}

export interface ProcessingMetrics {
  totalProcessed: number;
  successRate: number;
  avgQualityScore: number;
  pendingCount: number;
  failedCount: number;
  approvedCount: number;
  rejectedCount: number;
}
