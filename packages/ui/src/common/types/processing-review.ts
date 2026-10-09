export interface ReviewItem {
  nofo_name: string;
  review_id: string;
  status: "pending_review" | "approved" | "rejected" | "failed" | "reprocessing" | "needs_reupload" | "superseded";
  created_at: string;
  retryCount: number;
  source: "pipeline" | "dlq" | "duplicate" | "quality";
  errorMessage: string | null;
  guidanceTitle: string | null;
  guidanceSeverity: "critical" | "warning" | null;
  missingSections: string[];
  /** The grant's deadline (YYYY-MM-DD), or null when none is known. */
  deadline: string | null;
  /** Days from today (Eastern) to the deadline; negative once it has passed. */
  daysLeft: number | null;
  /** due_soon ≤ 7 days, upcoming ≤ 30, expired once past; null when no deadline is known. */
  deadlineUrgency: "due_soon" | "upcoming" | "later" | "expired" | null;
  grantStatus: string | null;
}

export interface ProcessingReviewList {
  /** Soonest deadline first, then no known deadline, then expired. */
  reviews: ReviewItem[];
  /** Open reviews (pending, failed, needs re-upload) on expired grants, whatever the filter. */
  expiredOpenCount: number;
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
  needsReuploadCount: number;
  supersededCount: number;
}
