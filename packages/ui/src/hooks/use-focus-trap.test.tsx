import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useFocusTrap } from "./use-focus-trap";

function Dialog({ onClose }: { onClose: () => void }) {
  const ref = useFocusTrap<HTMLDivElement>({ isOpen: true, onEscape: onClose });
  return (
    <div ref={ref} role="dialog" aria-label="Confirm">
      <button onClick={onClose}>Close</button>
    </div>
  );
}

function Harness({ removeTrigger }: { removeTrigger: boolean }) {
  const [open, setOpen] = useState(false);
  const [triggerShown, setTriggerShown] = useState(true);
  return (
    <div role="region" aria-label="List" tabIndex={-1}>
      <div>
        {triggerShown && <button onClick={() => setOpen(true)}>Open</button>}
      </div>
      {open && (
        <Dialog
          onClose={() => {
            setOpen(false);
            if (removeTrigger) setTriggerShown(false);
          }}
        />
      )}
    </div>
  );
}

function Drawer() {
  const ref = useFocusTrap<HTMLDivElement>({ isOpen: true, lockScroll: false });
  const [confirming, setConfirming] = useState(false);
  const [restored, setRestored] = useState(false);
  return (
    <main id="main-content" tabIndex={-1}>
      <div ref={ref} role="dialog" aria-label="Versions">
        <button>First in drawer</button>
        {!restored && <button onClick={() => setConfirming(true)}>Restore</button>}
        {confirming && (
          <Dialog
            onClose={() => {
              setConfirming(false);
              setRestored(true);
            }}
          />
        )}
      </div>
    </main>
  );
}

function MovesFocusOnClose() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <h1 tabIndex={-1} id="title">Applications</h1>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <Dialog
          onClose={() => {
            document.getElementById("title")?.focus();
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

describe("useFocusTrap", () => {
  it("returns focus to the element that opened it", async () => {
    render(<Harness removeTrigger={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });

  it("falls back to the nearest focusable ancestor when that element is gone", async () => {
    render(<Harness removeTrigger />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("button", { name: "Open" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "List" })).toHaveFocus();
  });

  it("stays inside the dialog beneath when the element that opened it is gone", async () => {
    render(<Drawer />);
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "First in drawer" })).toHaveFocus();
  });

  it("keeps focus where the page moved it while closing", async () => {
    render(<MovesFocusOnClose />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("heading", { name: "Applications" })).toHaveFocus();
  });
});
