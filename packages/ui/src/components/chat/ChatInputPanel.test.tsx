import { useState } from "react";
import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signedInAs } from "../../test/amplify";
import { renderApp } from "../../test/render";
import ChatInputPanel from "./ChatInputPanel";
import { ChatBotHistoryItem, ChatBotMessageType } from "./types";

vi.mock("react-speech-recognition", () => ({
  default: { startListening: vi.fn(), stopListening: vi.fn() },
  useSpeechRecognition: () => ({ transcript: "", listening: false, browserSupportsSpeechRecognition: false }),
}));

class FakeSocket extends EventTarget {
  static last: FakeSocket | null = null;
  sent: string[] = [];
  constructor(public url: string) {
    super();
    FakeSocket.last = this;
    queueMicrotask(() => this.dispatchEvent(new Event("open")));
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.dispatchEvent(new Event("close"));
  }
  frame(data: string) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

const GREETING: ChatBotHistoryItem = { type: ChatBotMessageType.AI, content: "Hello!", metadata: {} };
let history: ChatBotHistoryItem[] = [];

function Harness({ ensureSession }: { ensureSession?: () => Promise<void> }) {
  const [messages, setMessages] = useState<ChatBotHistoryItem[]>([GREETING]);
  const [running, setRunning] = useState(false);
  history = messages;
  return (
    <ChatInputPanel
      running={running}
      setRunning={setRunning}
      session={{ id: "s1", loading: false }}
      messageHistory={messages}
      setMessageHistory={setMessages}
      documentIdentifier="Grant A"
      ensureSession={ensureSession}
    />
  );
}

const answer = () => history[history.length - 1];

async function ask(ensureSession?: () => Promise<void>) {
  const { user } = renderApp(<Harness ensureSession={ensureSession} />);
  await user.type(screen.getByLabelText("Message the GrantWell assistant"), "What is the deadline?{Enter}");
  await waitFor(() => expect(FakeSocket.last?.sent).toHaveLength(1));
  return FakeSocket.last!;
}

beforeEach(() => {
  signedInAs();
  FakeSocket.last = null;
  vi.stubGlobal("WebSocket", FakeSocket);
  Element.prototype.scrollTo = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChatInputPanel socket frames", () => {
  it("never adds an API Gateway error frame to the answer", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ws = await ask();

    act(() => {
      ws.frame("The deadline is ");
      ws.frame('{"message": "Endpoint request timed out", "connectionId":"abc=", "requestId":"r-1"}');
      ws.frame("March 1.");
      ws.frame("!<|EOF_STREAM|>!");
      ws.frame("[]");
    });

    expect(answer()).toMatchObject({ type: ChatBotMessageType.AI, content: "The deadline is March 1." });
    expect(JSON.stringify(history)).not.toContain("Endpoint request timed out");
  });

  it("drops the partial answer on a reset and shows only what follows", async () => {
    const ws = await ask();

    act(() => ws.frame("I'll look that up first. "));
    expect(answer().content).toBe("I'll look that up first. ");

    act(() => ws.frame("<!RESET!>"));
    expect(answer().content).toBe("");
    expect(screen.queryByText(/RESET/)).not.toBeInTheDocument();

    act(() => {
      ws.frame("The deadline is March 1.");
      ws.frame("!<|EOF_STREAM|>!");
      ws.frame("[]");
    });
    expect(answer().content).toBe("The deadline is March 1.");
  });

  it("sends only the new message, after the chat is saved", async () => {
    const order: string[] = [];
    const ensureSession = vi.fn(async () => {
      order.push("saved");
    });
    const ws = await ask(ensureSession);
    order.push("sent");

    expect(ensureSession).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["saved", "sent"]);
    const { data } = JSON.parse(ws.sent[0]);
    expect(data).toMatchObject({ userMessage: "What is the deadline?", session_id: "s1", documentIdentifier: "Grant A" });
    expect(data).not.toHaveProperty("chatHistory");
  });
});
