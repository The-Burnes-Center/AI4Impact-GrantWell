import { describe, expect, it } from "vitest";
import { CHAT_ERROR_MESSAGE, chatErrorText, isGatewayErrorFrame } from "./utils";

describe("isGatewayErrorFrame", () => {
  it("matches API Gateway's own error frames", () => {
    expect(
      isGatewayErrorFrame('{"message": "Endpoint request timed out", "connectionId":"abc=", "requestId":"r-1"}'),
    ).toBe(true);
    expect(isGatewayErrorFrame('{"message":"Internal server error","connectionId":"abc=","requestId":"r-2"}')).toBe(true);
  });

  it("leaves answer text, sources and other frames alone", () => {
    expect(isGatewayErrorFrame("The deadline is March 1.")).toBe(false);
    expect(isGatewayErrorFrame('[{"title":"NOFO","uri":"s3://b/k"}]')).toBe(false);
    expect(isGatewayErrorFrame('{"message":"hi"}')).toBe(false);
    expect(isGatewayErrorFrame("{ not json")).toBe(false);
    expect(isGatewayErrorFrame(undefined)).toBe(false);
  });
});

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
