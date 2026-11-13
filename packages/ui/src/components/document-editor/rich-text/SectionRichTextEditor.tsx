import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getMarkRange, type Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { EditorState, Selection, TextSelection } from "@tiptap/pm/state";
import RichTextToolbar from "./RichTextToolbar";
import LinkDialog, { type LinkDialogValues } from "./LinkDialog";
import { useMediaQuery } from "./use-media-query";
import { editorMarkdown, markdownToDoc, sectionEditorExtensions } from "./editor-extensions";

export interface SectionRichTextEditorHandle {
  focus: () => void;
}

export interface SectionRichTextEditorProps {
  /** Markdown. */
  value: string;
  onChange: (markdown: string) => void;
  readOnly: boolean;
  labelledBy: string;
  describedBy?: string;
  placeholder?: string;
}

interface LinkTarget {
  from: number;
  to: number;
  editing: boolean;
  values: LinkDialogValues;
}

const PHONE = "(max-width: 768px)";

/** The section text as a rich-text editor whose value, in and out, is Markdown. */
const SectionRichTextEditor = forwardRef<SectionRichTextEditorHandle, SectionRichTextEditorProps>(
  function SectionRichTextEditor({ value, onChange, readOnly, labelledBy, describedBy, placeholder }, ref) {
    const contentId = useId();
    const compact = useMediaQuery(PHONE);
    const [link, setLink] = useState<LinkTarget | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    // The Markdown the parent holds and the Markdown the document serialises to, so an echo of our
    // own change (or a parent re-render) never resets the document, and loading never saves.
    const known = useRef<{ editor: Editor; value: string; markdown: string } | null>(null);
    const openLinkRef = useRef<() => void>(() => {});

    const attributes = useRef<Record<string, string>>({});
    attributes.current = {
      id: contentId,
      class: `se-rich-text__content${readOnly ? " se-rich-text__content--locked" : ""}`,
      tabindex: "0",
      "aria-multiline": "true",
      "aria-labelledby": labelledBy,
      ...(describedBy ? { "aria-describedby": describedBy } : {}),
      ...(readOnly ? { "aria-readonly": "true" } : {}),
      ...(placeholder ? { "aria-placeholder": placeholder } : {}),
    };

    const extensions = useMemo(() => sectionEditorExtensions({ placeholder }), [placeholder]);

    const editor = useEditor(
      {
        extensions,
        editable: !readOnly,
        shouldRerenderOnTransaction: false,
        editorProps: {
          attributes: () => attributes.current,
          handleKeyDown: (_view, event) => {
            if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
              event.preventDefault();
              openLinkRef.current();
              return true;
            }
            return false;
          },
        },
        onUpdate: ({ editor: changed }) => {
          if (!changed.isEditable || known.current?.editor !== changed) return;
          const markdown = editorMarkdown(changed);
          if (markdown === known.current.markdown) return;
          known.current = { editor: changed, value: markdown, markdown };
          onChangeRef.current(markdown);
        },
      },
      [extensions]
    );

    useImperativeHandle(ref, () => ({ focus: () => editor?.commands.focus() }), [editor]);

    useEffect(() => {
      if (!editor || editor.isDestroyed) return;
      editor.setEditable(!readOnly, false);
    }, [editor, readOnly, labelledBy, describedBy, placeholder]);

    useLayoutEffect(() => {
      if (!editor || editor.isDestroyed) return;
      if (known.current?.editor === editor && value === known.current.value) return;
      replaceDocument(editor, value);
      known.current = { editor, value, markdown: editorMarkdown(editor) };
    }, [editor, value]);

    const openLink = useCallback(() => {
      if (!editor || !editor.isEditable) return;
      const { state } = editor;
      const { from, to } = state.selection;
      const range = (editor.isActive("link") && getMarkRange(state.selection.$from, state.schema.marks.link)) || null;
      const target = range ?? { from, to };
      setLink({
        from: target.from,
        to: target.to,
        editing: !!range,
        values: {
          text: state.doc.textBetween(target.from, target.to, " "),
          url: range ? String(editor.getAttributes("link").href ?? "") : "",
        },
      });
    }, [editor]);
    openLinkRef.current = openLink;

    const closeLink = () => {
      editor?.commands.focus();
      setLink(null);
    };

    const saveLink = ({ text, url }: LinkDialogValues) => {
      if (!editor || !link) return;
      const unchanged = link.from !== link.to && text === link.values.text;
      const chain = editor.chain().focus();
      if (unchanged) {
        chain.setTextSelection({ from: link.from, to: link.to }).extendMarkRange("link").setLink({ href: url }).run();
      } else {
        chain
          .insertContentAt(
            { from: link.from, to: link.to },
            { type: "text", text, marks: [{ type: "link", attrs: { href: url } }] }
          )
          .unsetMark("link")
          .run();
      }
      setLink(null);
    };

    const removeLink = () => {
      if (!editor || !link) return;
      editor.chain().focus().setTextSelection({ from: link.from, to: link.to }).unsetLink().run();
      setLink(null);
    };

    if (!editor) return null;
    return (
      <div className="se-rich-text">
        <RichTextToolbar
          editor={editor}
          controlsId={contentId}
          readOnly={readOnly}
          compact={compact}
          onLink={openLink}
        />
        <EditorContent editor={editor} />
        <LinkDialog
          isOpen={!!link}
          editing={!!link?.editing}
          initial={link?.values ?? { text: "", url: "" }}
          onSave={saveLink}
          onRemove={removeLink}
          onClose={closeLink}
        />
      </div>
    );
  }
);

/** Sets new text from outside without an update event, a save, or an undo step back to the old text. */
function replaceDocument(editor: Editor, markdown: string) {
  const doc = markdownToDoc(editor, markdown);
  const { from, to } = editor.state.selection;
  const clamp = (pos: number) => Math.min(pos, doc.content.size);
  let selection: Selection;
  try {
    selection = TextSelection.between(doc.resolve(clamp(from)), doc.resolve(clamp(to)));
  } catch {
    selection = Selection.atStart(doc);
  }
  editor.view.updateState(EditorState.create({ doc, selection, plugins: editor.state.plugins }));
  editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
}

export default SectionRichTextEditor;
