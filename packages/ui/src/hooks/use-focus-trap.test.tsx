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
});
