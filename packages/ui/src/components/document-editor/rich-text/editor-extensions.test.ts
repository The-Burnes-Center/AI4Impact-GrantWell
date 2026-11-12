import { pasteInto } from "../../../test/prosemirror-dom";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { editorMarkdown, markdownToJson, sectionEditorExtensions } from "./editor-extensions";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function load(markdown: string) {
  editor = new Editor({ element: document.createElement("div"), extensions: sectionEditorExtensions() });
  editor.commands.setContent(markdownToJson(editor, markdown), { emitUpdate: false });
  return editor;
}

const SECTION = [
  "### Project goal",
  "",
  "We will **train** 120 *residents* of Kodiak & Unalaska over [BRACKETED PLACEHOLDER] years.",
  "",
  "#### How we will measure success",
  "",
  "- Quarterly reports",
  "- Job placement, as in the [evaluation plan](https://example.org/plan)",
  "",
  "1. Hire two instructors",
  "2. Sign partner letters",
  "",
  "| Item | Cost |",
  "| --- | --- |",
  "| Boats | **$4,000** |",
  "| Staff | $12,000 |",
].join("\n");

describe("section Markdown round trip", () => {
  it("renders headings, marks, both lists, links and tables as real structure", () => {
    const html = load(SECTION).getHTML();
    expect(html).toContain("<h3>Project goal</h3>");
    expect(html).toContain("<h4>How we will measure success</h4>");
    expect(html).toContain("<strong>train</strong>");
    expect(html).toContain("<em>residents</em>");
    expect(html).toMatch(/<ul><li><p>Quarterly reports<\/p><\/li>/);
    expect(html).toMatch(/<ol><li><p>Hire two instructors<\/p><\/li>/);
    expect(html).toContain('<a href="https://example.org/plan">evaluation plan</a>');
    expect(html).not.toContain("target=");
    expect(html).toMatch(/<table[^>]*>.*<th[^>]*><p>Item<\/p><\/th>.*<td[^>]*><p><strong>\$4,000<\/strong><\/p><\/td>/);
  });

  it("writes the same Markdown back, with text kept as typed", () => {
    const markdown = editorMarkdown(load(SECTION));
    expect(markdown).toContain("### Project goal\n\nWe will **train** 120 *residents* of Kodiak & Unalaska over [BRACKETED PLACEHOLDER] years.");
    expect(markdown).toContain("#### How we will measure success");
    expect(markdown).toContain("- Quarterly reports\n- Job placement, as in the [evaluation plan](https://example.org/plan)");
    expect(markdown).toContain("1. Hire two instructors\n2. Sign partner letters");
    expect(markdown).toMatch(/\| Item +\| Cost +\|\n\| -+ \| -+ \|\n\| Boats +\| \*\*\$4,000\*\* \|\n\| Staff +\| \$12,000 +\|/);
    expect(editorMarkdown(load(markdown))).toBe(markdown);
  });

  it("converts bold-only lines and #/## headings when the text loads", () => {
    const html = load("**Project Goal:**\nText.\n\n# Top\n\n## Second").getHTML();
    expect(html).toBe("<h3>Project Goal</h3><p>Text.</p><h3>Top</h3><h3>Second</h3>");
  });

  it("keeps blank paragraphs out of the Markdown", () => {
    const ed = load("One");
    ed.commands.setContent("<p>One</p><p></p><p></p><p>Two</p>", { emitUpdate: false });
    expect(editorMarkdown(ed)).toBe("One\n\nTwo");
  });
});

describe("pasting into a section", () => {
  it("keeps headings, bold, italic, lists, links and paragraphs and strips everything else", () => {
    const ed = load("");
    pasteInto(ed.view.dom, {
      text: "Title",
      html: [
        '<h1 style="color:red">Title</h1>',
        '<h5>Small heading</h5>',
        '<p><span style="font-family:Comic Sans"><u>under</u> <code>code</code> <s>gone</s> <b>bold</b> <i>it</i> ',
        '<a href="https://example.org" target="_blank">site</a> <a href="javascript:alert(1)">bad</a></span></p>',
        "<blockquote><p>Quoted</p></blockquote>",
        "<pre><code>line 1\nline 2</code></pre>",
        "<hr>",
        '<img src="https://example.org/x.png" alt="x">',
        "<ul><li>Point</li></ul><ol><li>Step</li></ol>",
      ].join(""),
    });
    const markdown = editorMarkdown(ed);
    expect(markdown).toBe(
      [
        "### Title",
        "#### Small heading",
        "under code gone **bold** *it* [site](https://example.org) bad",
        "Quoted",
        "line 1",
        "line 2",
        "- Point",
        "1. Step",
      ].join("\n\n")
    );
    expect(ed.getHTML()).not.toMatch(/<(u|code|s|blockquote|pre|hr|img|span)\b|style=|target=/);
  });

  it("reads pasted Markdown as formatting and other plain text as lines", () => {
    const ed = load("");
    pasteInto(ed.view.dom, { text: "**Goal**\n\nWe will *train* people.\n\n- one\n- two" });
    expect(editorMarkdown(ed)).toBe("### Goal\n\nWe will *train* people.\n\n- one\n- two");

    const plain = load("");
    pasteInto(plain.view.dom, { text: "12 Main Street\nSpringfield" });
    expect(plain.getHTML()).toBe("<p>12 Main Street</p><p>Springfield</p>");
  });
});
