import { describe, expect, it } from "vitest";
import { DailyLimitError, dailyLimitError } from "./daily-limit";

const MESSAGE = "You've reached today's limit of 10 generated applications. You can generate more tomorrow.";

describe("dailyLimitError", () => {
  it("carries the API's message for a daily-limit 429", () => {
    const err = dailyLimitError(429, { error: "DAILY_LIMIT_REACHED", message: MESSAGE });
    expect(err).toBeInstanceOf(DailyLimitError);
    expect(err?.message).toBe(MESSAGE);
  });

  it("ignores other 429s, such as API Gateway throttling", () => {
    expect(dailyLimitError(429, { message: "Too Many Requests" })).toBeNull();
  });

  it("ignores other statuses and bodies", () => {
    expect(dailyLimitError(500, { error: "DAILY_LIMIT_REACHED", message: MESSAGE })).toBeNull();
    expect(dailyLimitError(429, null)).toBeNull();
    expect(dailyLimitError(429, "DAILY_LIMIT_REACHED")).toBeNull();
  });
});
