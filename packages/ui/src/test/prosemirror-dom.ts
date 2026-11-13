// jsdom has no layout; ProseMirror measures the caret when it scrolls the selection into view.
const emptyRect = () => ({ x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) });

if (typeof Range !== "undefined") {
  Range.prototype.getBoundingClientRect ??= emptyRect as unknown as () => DOMRect;
  Range.prototype.getClientRects ??= (() => Object.assign([], { item: (): null => null })) as unknown as () => DOMRectList;
}
if (typeof document !== "undefined") {
  document.elementFromPoint ??= () => null;
}
if (typeof globalThis.ClipboardEvent === "undefined") {
  globalThis.ClipboardEvent = class ClipboardEvent extends Event {
    readonly clipboardData: DataTransfer | null;
    constructor(type: string, init?: ClipboardEventInit) {
      super(type, init);
      this.clipboardData = init?.clipboardData ?? null;
    }
  } as typeof globalThis.ClipboardEvent;
}

/** The editor's text as a reader sees it: one line per block. */
export function editorText(element: HTMLElement): string {
  return Array.from(element.children)
    .map((block) => block.textContent ?? "")
    .join("\n");
}

type Keyboard = { keyboard: (text: string) => Promise<void> };

/** Puts the caret at the end of a TipTap editor and types, as user.type does at the end of a textarea. */
export async function typeAtEnd(user: Keyboard, element: HTMLElement, text: string) {
  (element as HTMLElement & { editor: { commands: { focus: (at: string) => void } } }).editor.commands.focus("end");
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await user.keyboard(text);
}

/** A Ctrl+V into the element, carrying plain text and, optionally, HTML. */
export function pasteInto(element: HTMLElement, { text = "", html = "" }: { text?: string; html?: string }) {
  const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
  const data: Record<string, string> = { "text/plain": text, "text/html": html };
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (type: string) => data[type] ?? "", types: Object.keys(data).filter((k) => data[k]), files: [] },
  });
  element.dispatchEvent(event);
}
