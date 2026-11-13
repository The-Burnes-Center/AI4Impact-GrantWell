import { useEffect } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "../../../test/fetch-routes";
import { renderApp } from "../../../test/render";
import ChatMessage from "../../../components/chat/ChatMessage";
import { useChatPanel } from "../../../components/chat/chat-panel-context";
import { ChatBotMessageType } from "../../../components/chat/types";
import PlaygroundPage from "./PlaygroundPage";

vi.mock("../../../components/navigation/UnifiedNavigation", () => ({ default: (): null => null }));

const CITATIONS = [
  { n: 1, at: [5], quote: "Design 40%.", document: "Grant document", page: 18 },
  { n: 2, at: [10], quote: "Budget 15%.", document: "Grant document", page: 19 },
];

vi.mock("../../../components/chat/Chat", () => ({
  default: function FakeChat() {
    const panel = useChatPanel();
    const setAnswers = panel?.setAnswers;
    useEffect(() => {
      setAnswers?.([{ reply: 1, question: "How is it scored?", citations: CITATIONS, sources: [] }]);
    }, [setAnswers]);
    return (
      <ChatMessage
        replyNumber={1}
        documentIdentifier="Grant A"
        message={{ type: ChatBotMessageType.AI, content: "Design and budget.", metadata: { Sources: [], Citations: CITATIONS } }}
      />
    );
  },
}));

const realMatchMedia = window.matchMedia;

function phoneScreen(matches: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("playgroundHelpSeen", "true");
  stubFetch({
    "GET /s3-nofo-summary": json({ data: { GrantName: "Grant A Title", KeyDeadlines: [{ item: "Application due", description: "Due March 1." }] } }),
    "POST /user-documents/list": json({ documents: [] }),
    "POST /user-session": json({ document_keys: [], exists: true }),
    "GET /grant-pdf-url": json({ available: true, signedUrl: "https://s3.test/g" }),
  });
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

const render = () =>
  renderApp(
    <Routes>
      <Route path="/chat/:sessionId" element={<PlaygroundPage />} />
    </Routes>,
    { route: "/chat/s1?grant=Grant%20A" }
  );

describe("Chat page Grant panel", () => {
  it("shows the panel beside the chat and hides it with a toggle the browser remembers", async () => {
    phoneScreen(false);
    const { user, unmount } = render();
    expect(await screen.findByRole("heading", { level: 1, name: "Grant A Title" })).toBeInTheDocument();
    const panel = screen.getByRole("complementary", { name: "Grant panel" });
    const toggle = screen.getByRole("button", { name: "Hide grant panel" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", panel.id);
    expect(within(panel).getByText("Due March 1.")).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Show grant panel" })).toHaveAttribute("aria-expanded", "false");
    expect(panel).not.toBeVisible();
    expect(localStorage.getItem("grantwell:chat-grant-panel")).toBe("hidden");
    // With the panel hidden, a citation number opens its popover instead.
    await user.click(screen.getByRole("button", { name: "Source 1, Grant, page 18" }));
    expect(screen.getByRole("dialog", { name: "Source 1" })).toBeInTheDocument();

    unmount();
    render();
    expect(await screen.findByRole("button", { name: "Show grant panel" })).toBeInTheDocument();
  });

  it("opens the Sources tab at the card a citation number picks, with focus on it", async () => {
    phoneScreen(false);
    const { user } = render();
    await screen.findByRole("heading", { level: 1, name: "Grant A Title" });
    await user.click(screen.getByRole("button", { name: "Source 2, show in the panel" }));

    expect(screen.getByRole("tab", { name: "Sources, 2" })).toHaveAttribute("aria-selected", "true");
    const card = screen.getByRole("region", { name: "2 · Grant, page 19" });
    expect(card).toHaveFocus();
    expect(await within(card).findByRole("link", { name: "Open the grant at page 19 (opens in new tab)" })).toBeInTheDocument();
  });

  it("puts the panel in a Grant info sheet on a phone, which Escape closes back to its button", async () => {
    phoneScreen(true);
    const { user } = render();
    await screen.findByRole("heading", { level: 1, name: "Grant A Title" });
    expect(screen.queryByRole("complementary", { name: "Grant panel" })).toBeNull();
    expect(screen.queryByRole("button", { name: /grant panel/ })).toBeNull();

    const open = screen.getByRole("button", { name: "Grant info" });
    expect(open).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(open);
    const sheet = screen.getByRole("dialog", { name: "Grant info" });
    expect(within(sheet).getByRole("tablist", { name: "Grant info" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Close grant info" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Grant info" })).toBeNull());
    await waitFor(() => expect(open).toHaveFocus());
  });
});
