import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Modal } from "../../src/components/common/Modal";
import { axe } from "./axe";

function collectDuplicateIds(root: ParentNode): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  root.querySelectorAll("[id]").forEach((el) => {
    const id = el.getAttribute("id");
    if (!id) return;
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  });
  return duplicates;
}

describe("Modal accessibility", () => {
  it("exposes role=dialog, aria-modal and an aria-labelledby that resolves to its heading", async () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Delete grant">
        <p>Body copy</p>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();

    const heading = document.getElementById(labelledBy ?? "");
    expect(heading).not.toBeNull();
    expect(heading?.tagName).toBe("H2");
    expect(heading).toHaveTextContent("Delete grant");

    expect(screen.getByRole("dialog", { name: "Delete grant" })).toBe(dialog);
  });

  it("gives each of two simultaneously-mounted modals a distinct title id", () => {
    render(
      <>
        <Modal isOpen onClose={vi.fn()} title="First dialog">
          <p>First body</p>
        </Modal>
        <Modal isOpen onClose={vi.fn()} title="Second dialog">
          <p>Second body</p>
        </Modal>
      </>
    );

    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs).toHaveLength(2);

    const labelIds = dialogs.map((d) => d.getAttribute("aria-labelledby"));
    expect(labelIds.every((id): id is string => Boolean(id))).toBe(true);
    expect(new Set(labelIds).size).toBe(2);

    expect(document.getElementById(labelIds[0] ?? "")).toHaveTextContent("First dialog");
    expect(document.getElementById(labelIds[1] ?? "")).toHaveTextContent("Second dialog");

    expect(screen.getByRole("dialog", { name: "First dialog" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Second dialog" })).toBeInTheDocument();
  });

  it("emits no duplicate ids with two modals mounted", () => {
    render(
      <>
        <Modal isOpen onClose={vi.fn()} title="First dialog">
          <p>First body</p>
        </Modal>
        <Modal isOpen onClose={vi.fn()} title="Second dialog">
          <p>Second body</p>
        </Modal>
      </>
    );

    expect(collectDuplicateIds(document.body)).toEqual([]);
  });

  it("has an accessible close control", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Closable">
        <p>Body</p>
      </Modal>
    );

    expect(screen.getByRole("button", { name: /close modal/i })).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} title="Hidden">
        <p>Body</p>
      </Modal>
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is axe-clean, single and doubled up", async () => {
    const { container } = render(
      <>
        <Modal isOpen onClose={vi.fn()} title="First dialog">
          <p>First body</p>
        </Modal>
        <Modal isOpen onClose={vi.fn()} title="Second dialog">
          <p>Second body</p>
        </Modal>
      </>
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
