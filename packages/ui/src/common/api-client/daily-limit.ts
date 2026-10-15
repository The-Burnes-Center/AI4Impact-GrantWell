/** A request refused because the user reached a daily limit; the message says which and when it resets. */
export class DailyLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyLimitError";
  }
}

/** The DailyLimitError for an API response body that reports a daily limit, else null. */
export function dailyLimitError(status: number, body: unknown): DailyLimitError | null {
  if (status !== 429 || typeof body !== "object" || body === null) return null;
  const { error, message } = body as { error?: unknown; message?: unknown };
  if (error !== "DAILY_LIMIT_REACHED" || typeof message !== "string" || !message) return null;
  return new DailyLimitError(message);
}
