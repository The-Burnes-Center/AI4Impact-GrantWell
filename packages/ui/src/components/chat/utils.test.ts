import { describe, expect, it } from "vitest";
import { CHAT_ERROR_MESSAGE, chatErrorText } from "./utils";

describe("chatErrorText", () => {
  it("shows the message after the error sentinel, without the sentinel", () => {
    expect(chatErrorText("<!ERROR!>: Something went wrong while answering. Try again in a moment.")).toBe(
      "Something went wrong while answering. Try again in a moment.",
    );
  });

  it("falls back to a plain message when the frame carries no text", () => {
    expect(chatErrorText("<!ERROR!>:")).toBe(CHAT_ERROR_MESSAGE);
    expect(chatErrorText("<!ERROR!>:   ")).toBe(CHAT_ERROR_MESSAGE);
  });
});
