/** A request refused because the grant is held for an admin's review; the message says so. */
export class GrantInReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GrantInReviewError";
  }
}

/** The GrantInReviewError for an API response body that reports a grant in review, else null. */
export function grantInReviewError(status: number, body: unknown): GrantInReviewError | null {
  if (status !== 409 || typeof body !== "object" || body === null) return null;
  const { error, message } = body as { error?: unknown; message?: unknown };
  if (error !== "GRANT_IN_REVIEW" || typeof message !== "string" || !message) return null;
  return new GrantInReviewError(message);
}
