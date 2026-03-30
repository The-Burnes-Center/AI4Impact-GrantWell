export interface ReviewItem {
  nofo_name: string;
  review_id: string;
  status: "pending_review" | "approved" | "rejected" | "failed" | "reprocessing";
  created_at: string;
  retryCount: number;
  source: "pipeline" | "dlq" | "duplicate" | "quality";
  errorMessage: string | null;
  guidanceTitle: string | null;
  guidanceSeverity: "critical" | "warning" | null;
  missingSections: string[];
}

export interface AdminGuidance {
  reason: string;
  severity: "critical" | "warning";
  title: string;
  message: string;
  actions: string[];
  missingCategories: string[];
  canApprove: boolean;
}

export interface ReviewDetail extends ReviewItem {
  extractedSummary: Record<string, unknown> | null;
  extractedQuestions: Record<string, unknown> | null;
  validationResult: { overallVerdict: string } | null;
  s3DocumentKey: string;
  s3RawTextKey: string;
  documentTextPreview: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notes: string | null;
  corrections: Record<string, unknown> | null;
  adminGuidance: AdminGuidance | null;
}

export interface ProcessingMetrics {
  totalProcessed: number;
  successRate: number;
  pendingCount: number;
  failedCount: number;
  approvedCount: number;
  rejectedCount: number;
}
