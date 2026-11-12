import { editorText, typeAtEnd } from "../../../test/prosemirror-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import SectionRichTextEditor from "./SectionRichTextEditor";
import { LINK_URL_ERROR } from "./LinkDialog";

function Harness({
  initial,
  readOnly = false,
  onChange,
}: {
  initial: string;
  readOnly?: boolean;
  onChange: (markdown: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <h2 id="title">Statement of Need</h2>
      <p id="note">Read-only note</p>
      <button type="button" onClick={() => setValue("### Restored\n\nFrom a version.")}>
        Restore
      </button>
      <SectionRichTextEditor
        value={value}
        onChange={(markdown) => {
          setValue(markdown);
          onChange(markdown);
        }}
        readOnly={readOnly}
        labelledBy="title"
        describedBy={readOnly ? "note" : undefined}
        placeholder="Start writing your Statement of Need here..."
      />
    </>
  );
}

function setup(initial: string, options: { readOnly?: boolean; phone?: boolean } = {}) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: !!options.phone && query.includes("768px"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<Harness initial={initial} readOnly={options.readOnly} onChange={onChange} />);
  const textbox = screen.getByRole("textbox", { name: "Statement of Need" });
  const editor = (textbox as HTMLElement & { editor: Editor }).editor;
  return { user, onChange, textbox, editor };
}

const frame = () => act(() => new Promise((resolve) => requestAnimationFrame(resolve)));

describe("SectionRichTextEditor", () => {
  it("is a labelled multi-line text box that shows AI bold lines as headings without saving on load", async () => {
    const { textbox, onChange } = setup("**Project Goal**\nWe will train 120 residents.\n\n# Objectives");
    expect(textbox).toHaveAttribute("aria-multiline", "true");
    expect(textbox).toHaveAttribute("contenteditable", "true");
    expect(textbox).toHaveAttribute("aria-placeholder", "Start writing your Statement of Need here...");
    expect(within(textbox).getByRole("heading", { level: 3, name: "Project Goal" })).toBeInTheDocument();
    expect(within(textbox).getByRole("heading", { level: 3, name: "Objectives" })).toBeInTheDocument();
    await frame();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("saves the converted Markdown with the next real edit", async () => {
    const { user, textbox, onChange } = setup("**Project Goal**\nWe will train.");
    await typeAtEnd(user, textbox, "!");
    expect(onChange).toHaveBeenLastCalledWith("### Project Goal\n\nWe will train.!");
  });

  it("takes new text from outside without saving it", async () => {
    const { user, textbox, onChange } = setup("Old text");
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(editorText(textbox)).toBe("Restored\nFrom a version.");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Undo" })).toHaveAttribute("aria-disabled", "true");
  });

  it("is read-only while the AI writes, with the lock note as its description", async () => {
    const { user, textbox, onChange } = setup("Earlier text", { readOnly: true });
    expect(textbox).toHaveAttribute("contenteditable", "false");
    expect(textbox).toHaveAttribute("aria-readonly", "true");
    expect(textbox).toHaveAccessibleDescription("Read-only note");
    await user.type(textbox, "more");
    expect(editorText(textbox)).toBe("Earlier text");
    expect(onChange).not.toHaveBeenCalled();
    for (const button of within(screen.getByRole("toolbar")).getAllByRole("button")) {
      expect(button).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("lets Tab and Shift+Tab leave the editor, even inside a list", () => {
    const { textbox, editor } = setup("- one\n- two");
    act(() => {
      editor.commands.focus("end");
    });
    for (const shiftKey of [false, true]) {
      const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
      textbox.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
  });
});

describe("SectionRichTextEditor toolbar", () => {
  it("is one tab stop that arrow keys, Home and End move through, and controls the editor", async () => {
    const { user, textbox } = setup("Text");
    const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
    expect(toolbar).toHaveAttribute("aria-controls", textbox.id);
    const items = within(toolbar).getAllByRole("button");
    expect(items.map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual([
      "Text style: Paragraph",
      "Bold",
      "Italic",
      "Bulleted list",
      "Numbered list",
      "Link",
      "Undo",
      "Redo",
    ]);
    expect(items.filter((b) => b.tabIndex === 0)).toEqual([items[0]]);

    items[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(items[1]).toHaveFocus();
    expect(items[1]).toHaveAttribute("tabindex", "0");
    expect(items[0]).toHaveAttribute("tabindex", "-1");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(items[7]).toHaveFocus();
    await user.keyboard("{Home}");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{End}");
    expect(items[7]).toHaveFocus();
  });

  it("gives every icon button a tooltip that matches its name", () => {
    setup("Text");
    for (const button of within(screen.getByRole("toolbar")).getAllByRole("button").slice(1)) {
      expect(button.querySelector(".se-rt-tooltip")?.textContent).toBe(button.getAttribute("aria-label"));
    }
  });

  it("shows the selection's marks, lists and style, and toggles them from the keyboard", async () => {
    const { user, editor } = setup("Plain **bold** text\n\n1. Step");
    const bold = screen.getByRole("button", { name: "Bold" });
    expect(bold).toHaveAttribute("aria-pressed", "false");

    act(() => {
      editor.commands.setTextSelection(9);
    });
    expect(bold).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Numbered list" })).toHaveAttribute("aria-pressed", "false");

    act(() => {
      editor.commands.focus("end");
    });
    await frame();
    expect(screen.getByRole("button", { name: "Numbered list" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Bulleted list" })).toHaveAttribute("aria-pressed", "false");

    const italic = screen.getByRole("button", { name: "Italic" });
    italic.focus();
    await user.keyboard("{Enter}");
    expect(italic).toHaveAttribute("aria-pressed", "true");
    expect(italic).toHaveFocus();
  });

  it("sets a heading from the Text style menu and returns focus to the text, caret kept", async () => {
    const { user, textbox, editor } = setup("Project goal");
    act(() => {
      editor.commands.setTextSelection(5);
    });
    const style = screen.getByRole("button", { name: "Text style: Paragraph" });
    style.focus();
    await user.keyboard("{Enter}");
    const menu = screen.getByRole("menu", { name: "Text style: Paragraph" });
    const options = within(menu).getAllByRole("menuitemradio");
    expect(options.map((o) => o.textContent)).toEqual(["Paragraph", "Heading", "Subheading"]);
    expect(options[0]).toHaveFocus();
    expect(options[0]).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(within(textbox).getByRole("heading", { level: 3, name: "Project goal" })).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await frame();
    expect(textbox).toHaveFocus();
    expect(editor.state.selection.head).toBe(5);
    expect(screen.getByRole("button", { name: "Text style: Heading" })).toBeInTheDocument();
  });

  it("returns focus to the Text style button when the menu is closed without a choice", async () => {
    const { user } = setup("Project goal");
    const style = screen.getByRole("button", { name: "Text style: Paragraph" });
    style.focus();
    await user.keyboard("{ArrowUp}");
    expect(within(screen.getByRole("menu")).getByRole("menuitemradio", { name: "Subheading" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(style).toHaveFocus();
  });
});

describe("SectionRichTextEditor on a phone", () => {
  it("shrinks the toolbar to a Format menu, Bold, Italic and Undo", async () => {
    const { user, textbox, onChange } = setup("Step one", { phone: true });
    const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
    const items = within(toolbar).getAllByRole("button");
    expect(items.map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(["Format", "Bold", "Italic", "Undo"]);

    const format = items[0];
    expect(format).toHaveAttribute("aria-haspopup", "menu");
    format.focus();
    await user.keyboard("{ArrowDown}");
    const menu = screen.getByRole("menu", { name: "Format" });
    expect(format).toHaveAttribute("aria-expanded", "true");
    expect(Array.from(menu.querySelectorAll('[role^="menuitem"]')).map((i) => i.textContent)).toEqual([
      "Paragraph",
      "Heading",
      "Subheading",
      "Bulleted list",
      "Numbered list",
      "Link…",
    ]);
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Numbered list" })).toHaveAttribute("aria-checked", "false");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(format).toHaveFocus();
    expect(format).toHaveAttribute("aria-expanded", "false");

    await user.keyboard(" ");
    await user.keyboard("{End}{ArrowUp}{Enter}");
    expect(within(textbox).getByRole("list")).toBeInTheDocument();
    await frame();
    expect(textbox).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("1. Step one");
  });
});

describe("SectionRichTextEditor links", () => {
  it("checks the address, ties the error to the field, and returns focus to the editor", async () => {
    const { user, textbox, editor, onChange } = setup("See the plan");
    act(() => {
      editor.commands.setTextSelection({ from: 9, to: 13 });
    });
    await user.click(screen.getByRole("button", { name: "Link" }));
    const dialog = await screen.findByRole("dialog", { name: "Add link" });
    expect(within(dialog).getByLabelText("Text")).toHaveValue("plan");
    await waitFor(() => expect(within(dialog).getByLabelText("URL")).toHaveFocus());
    const url = within(dialog).getByLabelText("URL");
    expect(url).toHaveAccessibleDescription("Starts with https://, http:// or mailto:");

    await user.type(url, "javascript:alert(1)");
    await user.click(within(dialog).getByRole("button", { name: "Save link" }));
    expect(url).toHaveAttribute("aria-invalid", "true");
    expect(url).toHaveAccessibleDescription(`${LINK_URL_ERROR} Starts with https://, http:// or mailto:`);
    expect(url).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();

    await user.clear(url);
    await user.type(url, "https://example.org/plan");
    await user.click(within(dialog).getByRole("button", { name: "Save link" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(textbox).getByRole("link", { name: "plan" })).toHaveAttribute("href", "https://example.org/plan");
    expect(within(textbox).getByRole("link", { name: "plan" })).not.toHaveAttribute("target");
    expect(onChange).toHaveBeenLastCalledWith("See the [plan](https://example.org/plan)");
    await frame();
    expect(textbox).toHaveFocus();
  });

  it("inserts a new link with its own text where the caret is", async () => {
    const { user, editor, onChange } = setup("Write to us at .");
    act(() => {
      editor.commands.focus(16);
    });
    await frame();
    await user.click(screen.getByRole("button", { name: "Link" }));
    const dialog = await screen.findByRole("dialog", { name: "Add link" });
    await waitFor(() => expect(within(dialog).getByLabelText("Text")).toHaveFocus());
    expect(within(dialog).queryByRole("button", { name: "Remove link" })).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Text"), "our team");
    await user.type(within(dialog).getByLabelText("URL"), "mailto:team@example.org");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onChange).toHaveBeenLastCalledWith("Write to us at [our team](mailto:team@example.org).");
  });

  it("opens with Ctrl+K on a link, removes it, and closes on Escape", async () => {
    const { user, textbox, editor, onChange } = setup("See the [plan](https://example.org/plan)");
    act(() => {
      editor.commands.focus(10);
    });
    await frame();
    fireEvent.keyDown(textbox, { key: "k", ctrlKey: true });
    let dialog = await screen.findByRole("dialog", { name: "Edit link" });
    await waitFor(() => expect(within(dialog).getByLabelText("URL")).toHaveFocus());
    expect(within(dialog).getByLabelText("URL")).toHaveValue("https://example.org/plan");
    await user.click(within(dialog).getByRole("button", { name: "Remove link" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onChange).toHaveBeenLastCalledWith("See the plan");

    await user.click(screen.getByRole("button", { name: "Link" }));
    dialog = await screen.findByRole("dialog", { name: "Add link" });
    expect(within(dialog).getByLabelText("Text")).toHaveValue("plan");
    await waitFor(() => expect(within(dialog).getByLabelText("URL")).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await frame();
    expect(textbox).toHaveFocus();
  });
});

describe("SectionRichTextEditor pinned toolbar", () => {
  it("sits just below the page's pinned title bar and stepper", async () => {
    document.documentElement.style.setProperty("--gw-editor-sticky-height", "120px");
    try {
      setup("Text");
      await frame();
      expect(screen.getByRole("toolbar").style.getPropertyValue("--se-rt-toolbar-top")).toBe("120px");
    } finally {
      document.documentElement.style.removeProperty("--gw-editor-sticky-height");
    }
  });
});
