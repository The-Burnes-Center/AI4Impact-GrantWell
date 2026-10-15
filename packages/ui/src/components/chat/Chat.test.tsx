import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signedInAs } from "../../test/amplify";
import { json, stubFetch, type RouteRequest } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import Chat from "./Chat";

vi.mock("./ChatInputPanel", () => ({ default: (): null => null }));

const SESSION = "POST /user-session";

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
