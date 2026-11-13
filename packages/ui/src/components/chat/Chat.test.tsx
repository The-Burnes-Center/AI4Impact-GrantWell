import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signedInAs } from "../../test/amplify";
import { json, stubFetch, type RouteRequest } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import Chat from "./Chat";

const panel = vi.hoisted(() => ({ props: null as null | { ensureSession?: () => Promise<void> } }));
vi.mock("./ChatInputPanel", () => ({
  default: (props: { ensureSession?: () => Promise<void> }) => {
    panel.props = props;
    return <div data-testid="chat-input" />;
  },
}));

const SESSION = "POST /user-session";
const SUMMARY = "GET /s3-nofo-summary";
const GREETING =
  "Ask me anything about the Grant A Title grant: eligibility, deadlines, budget rules, scoring and what to submit.";

const turns = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    user: `Question ${from + i}`,
    chatbot: `Answer ${from + i}`,
    metadata: "[]",
  }));

const PAGES: Record<string, { chat_history: object[]; older_cursor: string | null }> = {
  newest: { chat_history: turns(5, 6), older_cursor: "5" },
  "5": { chat_history: turns(3, 4), older_cursor: "3" },
  "3": { chat_history: turns(1, 2), older_cursor: null },
};

const pageFor = (req: RouteRequest) => {
  const { cursor } = req.body as { cursor?: string };
  return json({ title: "Chat about Grant A", document_identifier: "Grant A", ...PAGES[cursor ?? "newest"] });
};

const questions = () =>
  screen.queryAllByText(/^Question \d$/).map((el) => el.textContent);

beforeEach(() => {
  signedInAs();
  Element.prototype.scrollTo = vi.fn();
});

function renderChat(reply: (req: RouteRequest) => Response | Promise<Response> = pageFor) {
  const net = stubFetch({ [SESSION]: reply });
  return { net, ...renderApp(<Chat sessionId="s1" documentIdentifier="Grant A" />) };
}

/** jsdom has no layout: give the transcript 100px per message and a settable scroll position. */
async function fakeLayout(area: HTMLElement) {
  await new Promise((r) => setTimeout(r, 150));
  let top = 0;
  Object.defineProperty(area, "scrollHeight", { configurable: true, get: () => area.querySelectorAll("li").length * 100 });
  Object.defineProperty(area, "clientHeight", { configurable: true, get: () => 300 });
  Object.defineProperty(area, "scrollTop", { configurable: true, get: () => top, set: (v: number) => { top = v; } });
}

describe("Chat earlier messages", () => {
  it("opens on the newest messages and loads older pages until the first one", async () => {
    const { net, user } = renderChat();

    await screen.findByText("Question 6");
    expect(questions()).toEqual(["Question 5", "Question 6"]);

    await user.click(screen.getByRole("button", { name: "Show earlier messages" }));
    await screen.findByText("Question 3");
    expect(questions()).toEqual(["Question 3", "Question 4", "Question 5", "Question 6"]);

    await user.click(screen.getByRole("button", { name: "Show earlier messages" }));
    await screen.findByText("Question 1");
    expect(questions()).toEqual(["Question 1", "Question 2", "Question 3", "Question 4", "Question 5", "Question 6"]);

    expect(screen.queryByRole("button", { name: "Show earlier messages" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Chat transcript" })).toHaveFocus();
    expect(net.to(SESSION).map((r) => (r.body as { cursor?: string }).cursor)).toEqual([undefined, "5", "3"]);
  });

  it("is reachable from the keyboard", async () => {
    const { user } = renderChat();
    await screen.findByText("Question 6");

    const button = screen.getByRole("button", { name: "Show earlier messages" });
    button.focus();
    await user.keyboard("{Enter}");

    await screen.findByText("Question 3");
    expect(screen.getByRole("button", { name: "Show earlier messages" })).toHaveFocus();
  });

  it("says it is loading and ignores repeat presses until the page arrives", async () => {
    let release: () => void = () => {};
    const { net, user } = renderChat((req) =>
      (req.body as { cursor?: string }).cursor
        ? new Promise<Response>((resolve) => { release = () => resolve(pageFor(req)); })
        : pageFor(req)
    );
    await screen.findByText("Question 6");

    await user.click(screen.getByRole("button", { name: "Show earlier messages" }));
    const busy = screen.getByRole("button", { name: "Loading earlier messages…" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByRole("status").some((s) => s.textContent === "Loading earlier messages…")).toBe(true);
    await user.click(busy);

    await act(async () => release());
    await screen.findByText("Question 3");
    expect(net.to(SESSION)).toHaveLength(2);
    expect(screen.getAllByRole("status").some((s) => s.textContent === "Earlier messages loaded")).toBe(true);
  });

  it("loads earlier messages on scrolling up and keeps the reading position", async () => {
    renderChat();
    await screen.findByText("Question 6");
    const area = screen.getByRole("group", { name: "Chat transcript" });
    await fakeLayout(area);

    area.scrollTop = 400;
    fireEvent.scroll(area);
    area.scrollTop = 50;
    fireEvent.scroll(area);

    await screen.findByText("Question 3");
    await waitFor(() => expect(area.scrollTop).toBe(50 + 4 * 100));
  });

  it("does not load earlier messages while scrolling down", async () => {
    const { net } = renderChat();
    await screen.findByText("Question 6");
    const area = screen.getByRole("group", { name: "Chat transcript" });
    await fakeLayout(area);

    area.scrollTop = 10;
    fireEvent.scroll(area);
    area.scrollTop = 20;
    fireEvent.scroll(area);

    await new Promise((r) => setTimeout(r, 20));
    expect(net.to(SESSION)).toHaveLength(1);
  });

  it("keeps the loaded messages and offers a retry when a page fails", async () => {
    const { user } = renderChat((req) =>
      (req.body as { cursor?: string }).cursor ? json("Internal server error", 500) : pageFor(req)
    );
    await screen.findByText("Question 6");

    await user.click(screen.getByRole("button", { name: "Show earlier messages" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Show earlier messages" })).toHaveAttribute("aria-disabled", "false")
    );
    expect(questions()).toEqual(["Question 5", "Question 6"]);
  });
});

describe("Chat new and unavailable chats", () => {
  beforeEach(() => {
    panel.props = null;
  });

  const operations = (net: ReturnType<typeof stubFetch>) =>
    net.to(SESSION).map((r) => (r.body as { operation: string }).operation);

  it("greets a new chat without saving it, and saves the greeting once before the first message", async () => {
    const net = stubFetch({
      [SESSION]: (req) => json((req.body as { operation: string }).operation === "add_session" ? { message: "ok" } : {}),
      [SUMMARY]: json({ data: { GrantName: "Grant A Title" } }),
    });
    renderApp(<Chat sessionId="s1" documentIdentifier="Grant A" />);

    await screen.findByText(GREETING);
    expect(operations(net)).toEqual(["get_session"]);

    await act(async () => {
      await Promise.all([panel.props!.ensureSession!(), panel.props!.ensureSession!()]);
    });
    await act(async () => panel.props!.ensureSession!());

    expect(operations(net)).toEqual(["get_session", "add_session"]);
    expect(net.last(SESSION).body).toMatchObject({
      session_id: "s1",
      title: "Chat about Grant A Title",
      document_identifier: "Grant A",
      chat_history: [{ user: "", chatbot: GREETING, metadata: "" }],
    });
  });

  it("shows the greeting first when a saved chat is reopened", async () => {
    stubFetch({
      [SESSION]: json({
        title: "Chat about Grant A",
        chat_history: [{ user: "", chatbot: GREETING, metadata: "" }, ...turns(1, 1)],
        older_cursor: null,
      }),
    });
    renderApp(<Chat sessionId="s1" documentIdentifier="Grant A" />);

    await screen.findByText("Question 1");
    const articles = screen.getAllByRole("article").map((a) => a.textContent);
    expect(articles[0]).toContain(GREETING);
    expect(articles[1]).toContain("Question 1");
  });

  it("says a chat link without a grant or saved messages isn't available", async () => {
    const net = stubFetch({ [SESSION]: json({}) });
    renderApp(<Chat sessionId="s1" />);

    expect(
      await screen.findByText("This chat isn't available. It may have been deleted, or the link is wrong.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to My chats" })).toHaveAttribute("href", "/chat/sessions");
    expect(net.to(SUMMARY)).toEqual([]);
    expect(screen.queryByTestId("chat-input")).not.toBeInTheDocument();
  });

  it("says the chat isn't available when its grant can't be loaded, without raw error codes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch({
      [SESSION]: json({}),
      [SUMMARY]: json({ error: "ACCESS_DENIED_STATE", message: "We couldn't confirm your access to this grant." }, 403),
    });
    const { container } = renderApp(<Chat sessionId="s1" documentIdentifier="Missing Grant" />);

    await screen.findByRole("link", { name: "Go to My chats" });
    expect(container.textContent).not.toMatch(/ACCESS_DENIED_STATE|refresh the page/i);
  });

  it("says a new chat's grant is being reviewed, with a Home link and no input or greeting", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const net = stubFetch({
      [SESSION]: json({}),
      [SUMMARY]: json({ error: "GRANT_IN_REVIEW", message: "This grant is being reviewed and will be back soon." }, 409),
    });
    const { container } = renderApp(<Chat sessionId="s1" documentIdentifier="Held Grant" />);

    const home = await screen.findByRole("link", { name: "Go to home" });
    expect(home).toHaveAttribute("href", "/home");
    expect(home.closest("li")).toHaveTextContent("This grant is being reviewed and will be back soon.");
    expect(screen.queryByTestId("chat-input")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/GRANT_IN_REVIEW|isn't available/);
    expect(operations(net)).toEqual(["get_session"]);
  });
});
