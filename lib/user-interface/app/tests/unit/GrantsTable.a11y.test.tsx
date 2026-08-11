import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GrantsTable } from "../../src/pages/home/GrantsTable";
import type { NOFO } from "../../src/common/types/nofo";
import { axe } from "./axe";

const nofos: NOFO[] = [
  {
    id: 1,
    name: "Clean Water Infrastructure Fund",
    status: "active",
    agency: "Environmental Protection Agency",
    category: "Environment",
    grantType: "federal",
    expirationDate: "2030-01-15",
  },
  {
    id: 2,
    name: "Community Housing Support",
    status: "active",
    agency: "Housing and Urban Development",
    category: "Housing",
    grantType: "state",
    isRolling: true,
  },
  {
    id: 3,
    name: "Retired Broadband Program",
    status: "archived",
    agency: "Department of Commerce",
    category: "Infrastructure",
    grantType: "federal",
    expirationDate: "2020-03-01",
  },
];

function renderTable(overrides: Partial<React.ComponentProps<typeof GrantsTable>> = {}) {
  const onSelectDocument = vi.fn();
  const result = render(
    <GrantsTable nofos={nofos} loading={false} onSelectDocument={onSelectDocument} {...overrides} />
  );
  return { ...result, onSelectDocument };
}

function dataRows(): HTMLElement[] {
  const table = screen.getByRole("table", { name: "Grants" });
  return within(table)
    .getAllByRole("row")
    .filter((row) => within(row).queryAllByRole("cell").length > 0);
}

/** The grant-name control inside a row — the real tab stop for selecting a grant. */
function grantButton(name: RegExp): HTMLElement {
  return screen.getByRole("button", { name });
}

function showArchived(): void {
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "all" } });
}

describe("GrantsTable keyboard accessibility", () => {
  it("exposes each selectable grant as a real button, not a focusable row", () => {
    renderTable();

    const rows = dataRows();
    expect(rows.length).toBe(2);
    for (const row of rows) {
      // A focusable role="row" inside role="table" is not a valid interactive
      // pattern; the actionable control must be a button in the name cell.
      expect(row).not.toHaveAttribute("tabindex");
      expect(within(row).getByRole("button", { name: /^Select / })).toBeEnabled();
    }
  });

  it("activates a grant on Enter", async () => {
    const user = userEvent.setup();
    const { onSelectDocument } = renderTable();

    const button = grantButton(/Clean Water Infrastructure Fund/);
    button.focus();
    expect(button).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(onSelectDocument).toHaveBeenCalledTimes(1);
    expect(onSelectDocument).toHaveBeenCalledWith({
      label: "Clean Water Infrastructure Fund",
      value: "Clean Water Infrastructure Fund/",
    });
  });

  it("activates a grant on Space", async () => {
    const user = userEvent.setup();
    const { onSelectDocument } = renderTable();

    const button = grantButton(/Community Housing Support/);
    button.focus();
    expect(button).toHaveFocus();

    await user.keyboard(" ");

    expect(onSelectDocument).toHaveBeenCalledTimes(1);
    expect(onSelectDocument).toHaveBeenCalledWith({
      label: "Community Housing Support",
      value: "Community Housing Support/",
    });
  });

  it("reaches a grant by tabbing, without a mouse", async () => {
    const user = userEvent.setup();
    const { onSelectDocument } = renderTable();

    const button = grantButton(/Clean Water Infrastructure Fund/);
    for (let i = 0; i < 40 && document.activeElement !== button; i += 1) {
      await user.tab();
    }
    expect(button).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onSelectDocument).toHaveBeenCalledTimes(1);
  });

  it("keeps keyboard and pointer activation in agreement", async () => {
    const user = userEvent.setup();
    const { onSelectDocument } = renderTable();

    const button = grantButton(/Clean Water Infrastructure Fund/);
    await user.click(button);
    const viaPointer = onSelectDocument.mock.calls[0];

    onSelectDocument.mockClear();
    button.focus();
    await user.keyboard("{Enter}");
    const viaKeyboard = onSelectDocument.mock.calls[0];

    expect(viaKeyboard).toEqual(viaPointer);
  });

  it("disables archived grants so they leave the tab order and ignore Enter", async () => {
    const user = userEvent.setup();
    const { onSelectDocument } = renderTable();
    showArchived();

    const archived = grantButton(/Retired Broadband Program/);
    expect(archived).toBeDisabled();

    archived.focus();
    await user.keyboard("{Enter}");
    expect(onSelectDocument).not.toHaveBeenCalled();
  });

  it("names the grant control with its visible title and marks headers as buttons", () => {
    renderTable();

    for (const row of dataRows()) {
      const title = within(row).getByRole("button", { name: /^Select / });
      // WCAG 2.5.3: the accessible name must contain the visible label.
      expect(title.getAttribute("aria-label")).toContain(title.textContent?.trim());
    }

    for (const label of ["Name", "Agency", "Category", "Type", "Deadline"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("exposes sort state on the column headers", async () => {
    const user = userEvent.setup();
    renderTable();

    const nameHeader = screen.getByRole("columnheader", { name: "Name" });
    expect(nameHeader).toHaveAttribute("aria-sort", "none");

    await user.click(screen.getByRole("button", { name: "Name" }));
    expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute(
      "aria-sort",
      "ascending"
    );
  });

  it("is axe-clean with rows rendered", async () => {
    const { container } = renderTable();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("is axe-clean in the empty state", async () => {
    const { container } = renderTable({ nofos: [] });
    expect(await axe(container)).toHaveNoViolations();
  });
});
