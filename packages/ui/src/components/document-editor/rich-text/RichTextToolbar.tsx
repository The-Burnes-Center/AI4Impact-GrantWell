import React, { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import type { IconType } from "react-icons";
import { LuBold, LuItalic, LuLink, LuList, LuListOrdered, LuRedo2, LuUndo2 } from "react-icons/lu";
import ToolbarMenuButton, { type ToolbarMenuItem } from "./ToolbarMenuButton";
import { HEADING_LEVEL, SUBHEADING_LEVEL } from "./editor-extensions";
import { pinnedBarsHeight, scrollContainer, toolbarStickyTop } from "./pinned-bars";

type BlockStyle = "paragraph" | "heading" | "subheading" | "other";

const STYLE_LABEL: Record<BlockStyle, string> = {
  paragraph: "Paragraph",
  heading: "Heading",
  subheading: "Subheading",
  other: "Other",
};

interface RichTextToolbarProps {
  editor: Editor;
  controlsId: string;
  readOnly: boolean;
  compact: boolean;
  onLink: () => void;
}

type Item =
  | { kind: "menu"; key: string; content: React.ReactNode; items: ToolbarMenuItem[] }
  | {
      kind: "button";
      key: string;
      label: string;
      icon: IconType;
      pressed?: boolean;
      disabled?: boolean;
      opensDialog?: boolean;
      run: () => void;
    }
  | { kind: "separator"; key: string };

const RichTextToolbar: React.FC<RichTextToolbarProps> = ({ editor, controlsId, readOnly, compact, onLink }) => {
  const [active, setActive] = useState(0);
  const [tooltipsHidden, setTooltipsHidden] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const update = () => {
      const container = scrollContainer(toolbar);
      const top = toolbarStickyTop(pinnedBarsHeight(), container ? container.getBoundingClientRect().top : null);
      toolbar.style.setProperty("--se-rt-toolbar-top", `${top}px`);
    };
    update();
    const frame = requestAnimationFrame(update);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      block: (e.isActive("heading", { level: HEADING_LEVEL })
        ? "heading"
        : e.isActive("heading", { level: SUBHEADING_LEVEL })
          ? "subheading"
          : e.isActive("paragraph")
            ? "paragraph"
            : "other") as BlockStyle,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain();
  const setBlock = (style: BlockStyle) => {
    if (style === "paragraph") chain().setParagraph().run();
    else chain().setHeading({ level: style === "heading" ? HEADING_LEVEL : SUBHEADING_LEVEL }).run();
  };
  const styleItems: ToolbarMenuItem[] = (["paragraph", "heading", "subheading"] as const).map((style) => ({
    kind: "radio",
    label: STYLE_LABEL[style],
    checked: state.block === style,
    onSelect: () => setBlock(style),
  }));

  const bold: Item = {
    kind: "button",
    key: "bold",
    label: "Bold",
    icon: LuBold,
    pressed: state.bold,
    run: () => chain().toggleBold().run(),
  };
  const italic: Item = {
    kind: "button",
    key: "italic",
    label: "Italic",
    icon: LuItalic,
    pressed: state.italic,
    run: () => chain().toggleItalic().run(),
  };
  const undo: Item = {
    kind: "button",
    key: "undo",
    label: "Undo",
    icon: LuUndo2,
    disabled: !state.canUndo,
    run: () => chain().undo().run(),
  };

  const items: Item[] = compact
    ? [
        {
          kind: "menu",
          key: "format",
          content: "Format",
          items: [
            ...styleItems,
            { kind: "separator" },
            { kind: "checkbox", label: "Bulleted list", checked: state.bulletList, onSelect: () => chain().toggleBulletList().run() },
            { kind: "checkbox", label: "Numbered list", checked: state.orderedList, onSelect: () => chain().toggleOrderedList().run() },
            { kind: "separator" },
            { kind: "action", label: "Link…", opensDialog: true, onSelect: onLink },
          ],
        },
        bold,
        italic,
        undo,
      ]
    : [
        {
          kind: "menu",
          key: "style",
          content: (
            <>
              <span className="visually-hidden">Text style:</span>{" "}
              <span className="se-rt-menu__value">{STYLE_LABEL[state.block]}</span>
            </>
          ),
          items: styleItems,
        },
        { kind: "separator", key: "s1" },
        bold,
        italic,
        { kind: "separator", key: "s2" },
        {
          kind: "button",
          key: "bullet",
          label: "Bulleted list",
          icon: LuList,
          pressed: state.bulletList,
          run: () => chain().toggleBulletList().run(),
        },
        {
          kind: "button",
          key: "ordered",
          label: "Numbered list",
          icon: LuListOrdered,
          pressed: state.orderedList,
          run: () => chain().toggleOrderedList().run(),
        },
        { kind: "separator", key: "s3" },
        { kind: "button", key: "link", label: "Link", icon: LuLink, opensDialog: true, run: onLink },
        { kind: "separator", key: "s4" },
        undo,
        {
          kind: "button",
          key: "redo",
          label: "Redo",
          icon: LuRedo2,
          disabled: !state.canRedo,
          run: () => chain().redo().run(),
        },
      ];

  const focusable = items.filter((item) => item.kind !== "separator");
  const current = Math.min(active, focusable.length - 1);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[role="menu"]')) return;
    if (event.key === "Escape") {
      setTooltipsHidden(true);
      return;
    }
    const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-rt-item]"));
    const from = nodes.indexOf(event.target as HTMLElement);
    if (from === -1) return;
    const next =
      event.key === "ArrowRight"
        ? (from + 1) % nodes.length
        : event.key === "ArrowLeft"
          ? (from - 1 + nodes.length) % nodes.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? nodes.length - 1
              : -1;
    if (next === -1) return;
    event.preventDefault();
    nodes[next].focus();
  };

  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-rt-item]"));
    const index = nodes.indexOf(event.target as HTMLElement);
    if (index !== -1) {
      setActive(index);
      setTooltipsHidden(false);
    }
  };

  let position = -1;
  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Formatting"
      aria-controls={controlsId}
      className={`se-rt-toolbar${tooltipsHidden ? " se-rt-toolbar--tooltips-hidden" : ""}`}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onMouseLeave={() => setTooltipsHidden(false)}
    >
      {items.map((item) => {
        if (item.kind === "separator") return <span key={item.key} className="se-rt-separator" aria-hidden="true" />;
        position += 1;
        const tabIndex = position === current ? 0 : -1;
        if (item.kind === "menu") {
          return (
            <ToolbarMenuButton
              key={item.key}
              items={item.items}
              disabled={readOnly}
              tabIndex={tabIndex}
              onChosen={() => editor.commands.focus()}
            >
              {item.content}
            </ToolbarMenuButton>
          );
        }
        const Icon = item.icon;
        const disabled = readOnly || item.disabled;
        return (
          <button
            key={item.key}
            type="button"
            className="se-rt-btn se-rt-btn--icon"
            aria-label={item.label}
            aria-pressed={item.pressed === undefined ? undefined : item.pressed}
            aria-haspopup={item.opensDialog ? "dialog" : undefined}
            aria-disabled={disabled || undefined}
            tabIndex={tabIndex}
            data-rt-item=""
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              if (disabled || (event.target as HTMLElement).closest(".se-rt-tooltip")) return;
              if (event.detail > 0 && !item.opensDialog) editor.commands.focus();
              item.run();
            }}
          >
            <Icon size={18} aria-hidden="true" />
            <span className="se-rt-tooltip" aria-hidden="true">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default RichTextToolbar;
