import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import ChatMessage from "./ChatMessage";
import { ChatBotMessageType } from "./types";

const content = "Applications are due **March 1, 2027**. Late ones are not read. Use `code here` too.";
const citations = [
  { n: 1, at: [38], quote: "All applications must be received by March 1, 2027.", document: "Grant document", page: 12, lastPage: 12 },
  { n: 2, at: [62, 38], quote: "Late applications will not be reviewed.", document: "board.pdf", page: 3, lastPage: 4 },
  { n: 3, at: [70], quote: "Budgets are due with the application.", document: "Grant document" },
];

const render = (documentIdentifier?: string) =>
  renderApp(
    <ChatMessage
      documentIdentifier={documentIdentifier}
      message={{ type: ChatBotMessageType.AI, content, metadata: { Sources: [], Citations: citations } }}
    />
  );

describe("citation markers", () => {
  it("puts numbered source buttons after the cited text", () => {
    const { container } = render();

    const buttons = screen.getAllByRole("button", { name: /^Source \d/ });
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Source 1, Grant, page 12",
      "Source 2, board.pdf, pages 3–4",
      "Source 2, board.pdf, pages 3–4",
      "Source 3, Grant",
    ]);
    expect(container.querySelector("strong")?.textContent).toBe("March 1, 202712");
    expect(container.querySelector("code")?.textContent).toBe("code here");
  });

  it("opens a named dialog with the source and the quote, and Escape returns focus to the marker", async () => {
    const { user } = render();
    const button = screen.getByRole("button", { name: "Source 1, Grant, page 12" });

    expect(button).toHaveAttribute("aria-expanded", "false");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const dialog = screen.getByRole("dialog", { name: "Source 1" });
    expect(button).toHaveAttribute("aria-controls", dialog.id);
    expect(dialog).toHaveFocus();
    expect(dialog.querySelector("q")?.textContent).toBe("All applications must be received by March 1, 2027.");
    expect(dialog).toHaveTextContent("Grant, page 12");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("closes with its close button, returning focus to the marker", async () => {
    const { user } = render();
    const button = screen.getAllByRole("button", { name: "Source 2, board.pdf, pages 3–4" })[0];
    await user.click(button);
    expect(screen.getByRole("dialog", { name: "Source 2" })).toHaveTextContent("board.pdf, pages 3–4");
    await user.click(screen.getByRole("button", { name: "Close source 2" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("closes when the user clicks elsewhere", async () => {
    const { user } = render();
    const button = screen.getByRole("button", { name: "Source 1, Grant, page 12" });
    await user.click(button);
    await user.click(document.body);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("links a grant quote to its page of the grant's PDF, in a new tab", async () => {
    const { calls } = stubFetch({ "GET /grant-pdf-url": json({ available: true, signedUrl: "https://s3.test/x" }) });
    const { user } = render("Bridge Grant/");
    await user.click(screen.getByRole("button", { name: "Source 1, Grant, page 12" }));

    const link = await screen.findByRole("link", { name: "Open the grant at page 12 (opens in new tab)" });
    expect(link).toHaveAttribute("href", "/grant-pdf?grant=Bridge+Grant&page=12");
    expect(link).toHaveAttribute("target", "_blank");
    expect(calls[0].url.searchParams.get("grant")).toBe("Bridge Grant");
  });

  it("has no link for a grant without a PDF, a quote without a page, or a supporting document", async () => {
    stubFetch({ "GET /grant-pdf-url": json({ available: false }) });
    const { user } = render("Text Grant");
    await user.click(screen.getByRole("button", { name: "Source 1, Grant, page 12" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.queryByRole("link")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Source 3, Grant" }));
    expect(screen.getByRole("dialog", { name: "Source 3" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();

    await user.click(screen.getAllByRole("button", { name: "Source 2, board.pdf, pages 3–4" })[0]);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders older answers without citations as before", () => {
    renderApp(<ChatMessage message={{ type: ChatBotMessageType.AI, content, metadata: {} }} />);
    expect(screen.queryByRole("button", { name: /^Source/ })).toBeNull();
  });
});
