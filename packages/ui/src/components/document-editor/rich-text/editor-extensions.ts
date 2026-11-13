import { Extension, type AnyExtension, type Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { ListItem, ListKeymap } from "@tiptap/extension-list";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { Fragment, Slice, type Node as PMNode, type Schema } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { normalizeSectionMarkdown } from "./section-markdown";
import { caretShortfall, pinnedBarsHeight } from "./pinned-bars";

export const HEADING_LEVEL = 3;
export const SUBHEADING_LEVEL = 4;

const withoutTab = <T extends Record<string, unknown>>(shortcuts: T | undefined) => {
  const rest: Record<string, unknown> = { ...(shortcuts ?? {}) };
  delete rest.Tab;
  delete rest["Shift-Tab"];
  return rest as T;
};

// Tab and Shift+Tab must move focus out of the editor, so nothing may claim them.
const SectionListItem = ListItem.extend({
  addKeyboardShortcuts() {
    return withoutTab(this.parent?.());
  },
});
const SectionListKeymap = ListKeymap.extend({
  addKeyboardShortcuts() {
    return withoutTab(this.parent?.());
  },
});
const SectionTable = Table.extend({
  addKeyboardShortcuts() {
    return withoutTab(this.parent?.());
  },
});

export const isAllowedLinkUrl = (url: string) => /^(https?:\/\/[^\s]+|mailto:[^\s]+)$/i.test(url.trim());

const PASTE_NODES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "hardBreak",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
]);
const PASTE_MARKS = new Set(["bold", "italic", "link"]);

function sanitizeNodes(fragment: Fragment, schema: Schema): PMNode[] {
  const out: PMNode[] = [];
  fragment.forEach((node) => {
    if (node.isText) {
      const marks = node.marks
        .filter((mark) => PASTE_MARKS.has(mark.type.name))
        .map((mark) => (mark.type.name === "link" ? mark.type.create({ href: mark.attrs.href }) : mark));
      out.push(node.mark(marks));
      return;
    }
    if (PASTE_NODES.has(node.type.name)) {
      const attrs =
        node.type.name === "heading"
          ? { ...node.attrs, level: node.attrs.level <= HEADING_LEVEL ? HEADING_LEVEL : SUBHEADING_LEVEL }
          : node.attrs;
      try {
        out.push(node.type.createChecked(attrs, Fragment.fromArray(sanitizeNodes(node.content, schema))));
      } catch {
        out.push(...textAsParagraphs(node.textContent, schema));
      }
      return;
    }
    if (node.isTextblock) {
      out.push(...textAsParagraphs(node.textContent, schema));
      return;
    }
    if (node.isLeaf) return;
    out.push(...sanitizeNodes(node.content, schema));
  });
  return out;
}

function textAsParagraphs(text: string, schema: Schema): PMNode[] {
  return text
    .split(/\r\n?|\n/)
    .filter((line) => line.trim())
    .map((line) => schema.nodes.paragraph.create(null, schema.text(line)));
}

/** Keeps headings, bold, italic, lists, links, paragraphs and tables; everything else becomes plain text. */
export function sanitizePastedSlice(slice: Slice, schema: Schema): Slice {
  const fragment = Fragment.fromArray(sanitizeNodes(slice.content, schema));
  const max = Slice.maxOpen(fragment);
  return new Slice(fragment, Math.min(slice.openStart, max.openStart), Math.min(slice.openEnd, max.openEnd));
}

export function normalizePastedHtml(html: string): string {
  return html
    .replace(/<(\/?)h[12](?=[\s>])/gi, "<$1h3")
    .replace(/<(\/?)h[56](?=[\s>])/gi, "<$1h4");
}

const LOOKS_LIKE_MARKDOWN = /^\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|\|)|\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]+\]\([^)\s]+\)/m;

function markdownSlice(editor: Editor, text: string): Slice | null {
  if (!editor.markdown || !LOOKS_LIKE_MARKDOWN.test(text)) return null;
  const doc = markdownToDoc(editor, text);
  return new Slice(doc.content, Slice.maxOpen(doc.content).openStart, Slice.maxOpen(doc.content).openEnd);
}

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

export function markdownToJson(editor: Editor, markdown: string): JSONContent {
  const json = editor.markdown?.parse(normalizeSectionMarkdown(markdown ?? "")) ?? EMPTY_DOC;
  return json.content?.length ? json : EMPTY_DOC;
}

export function markdownToDoc(editor: Editor, markdown: string): PMNode {
  return editor.schema.nodeFromJSON(markdownToJson(editor, markdown));
}

/** Text is kept as typed: drafts have always been Markdown, so the export and the AI read it as such. */
export function editorMarkdown(editor: Editor): string {
  return (editor.getMarkdown?.() ?? "")
    .replace(/^&nbsp;$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Runs after the Markdown extension has made its manager (same priority, later in the list).
const RawMarkdownText = Extension.create({
  name: "rawMarkdownText",
  onBeforeCreate() {
    const manager = this.editor.markdown as unknown as { encodeTextForMarkdown?: (text: string) => string } | undefined;
    if (manager) manager.encodeTextForMarkdown = (text: string) => text;
  },
});

/** WCAG 2.4.11: after ProseMirror scrolls the caret into view, move it out from under the pinned bars and toolbar. */
function keepCaretClearOfPinnedBars(view: EditorView) {
  requestAnimationFrame(() => {
    if (view.isDestroyed || !view.hasFocus()) return;
    let caret: { top: number };
    try {
      caret = view.coordsAtPos(view.state.selection.head);
    } catch {
      return;
    }
    const toolbar = view.dom.closest(".se-rich-text")?.querySelector<HTMLElement>(".se-rt-toolbar");
    const toolbarBottom =
      toolbar && getComputedStyle(toolbar).position === "sticky" ? toolbar.getBoundingClientRect().bottom : null;
    let shortfall = caretShortfall(caret.top, pinnedBarsHeight(), toolbarBottom);
    // Inner scroll containers first: a toolbar pinned inside one moves with the page, not with it.
    for (let el = view.dom.parentElement; el && shortfall > 0; el = el.parentElement) {
      if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight) {
        const top = el.scrollTop;
        el.scrollTop = Math.max(0, top - shortfall);
        shortfall -= top - el.scrollTop;
      }
    }
    if (shortfall > 0) window.scrollBy({ top: -shortfall, behavior: "instant" as ScrollBehavior });
  });
}

const SectionEditorBehaviour = Extension.create({
  name: "sectionEditorBehaviour",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("sectionEditorBehaviour"),
        props: {
          transformPastedHTML: (html) => normalizePastedHtml(html),
          transformPasted: (slice, view) => sanitizePastedSlice(slice, view.state.schema),
          clipboardTextParser: (text, _context, plain) => (plain ? null : markdownSlice(editor, text)) as Slice,
          handleScrollToSelection: (view) => {
            keepCaretClearOfPinnedBars(view);
            return false;
          },
        },
      }),
    ];
  },
});

export function sectionEditorExtensions(options: { placeholder?: string } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [HEADING_LEVEL, SUBHEADING_LEVEL] },
      link: false,
      listItem: false,
      listKeymap: false,
      underline: false,
      trailingNode: false,
    }),
    SectionListItem,
    SectionListKeymap,
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: { target: null, rel: null },
      isAllowedUri: (url) => isAllowedLinkUrl(url),
      shouldAutoLink: (url) => /^(https?:\/\/|www\.)/i.test(url),
    }),
    SectionTable.configure({ resizable: false, renderWrapper: true }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder: options.placeholder ?? "" }),
    Markdown.configure({ markedOptions: { gfm: true } }),
    RawMarkdownText,
    SectionEditorBehaviour,
  ];
}
