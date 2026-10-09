import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PaginationControls from "./PaginationControls";

const noop = () => {};

describe("PaginationControls", () => {
  it("shows ranges and disables Previous on the first page and Next on the last", () => {
    const { rerender } = render(
      <PaginationControls currentPage={1} totalPages={3} totalItems={23} itemsPerPage={10} onPageChange={noop} onItemsPerPageChange={noop} />
    );
    expect(screen.getByText("Showing 1 to 10 of 23 grants")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();

    rerender(
      <PaginationControls currentPage={3} totalPages={3} totalItems={23} itemsPerPage={10} onPageChange={noop} onItemsPerPageChange={noop} />
    );
    expect(screen.getByText("Showing 21 to 23 of 23 grants")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("windows long page lists around the current page", () => {
    render(
      <PaginationControls currentPage={10} totalPages={20} totalItems={200} itemsPerPage={10} onPageChange={noop} onItemsPerPageChange={noop} />
    );
    const pages = screen.getAllByRole("button", { name: /^Go to page/ }).map((b) => b.textContent);
    expect(pages).toEqual(["1", "8", "9", "10", "11", "12", "20"]);
    expect(screen.getByRole("button", { name: "Go to page 10" })).toHaveAttribute("aria-current", "page");
  });

  it("in token mode, enables Next only when the server sent a next token", async () => {
    const onPageChange = vi.fn();
    const props = { mode: "token" as const, currentPage: 2, pageItemCount: 25, itemsPerPage: 25, itemLabel: "users", onPageChange, onItemsPerPageChange: noop };
    const { rerender } = render(<PaginationControls {...props} hasNextPage />);
    expect(screen.getByText("Showing 26 to 50 users on page 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    rerender(<PaginationControls {...props} hasNextPage={false} />);
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(
      <PaginationControls currentPage={1} totalPages={0} totalItems={0} itemsPerPage={10} onPageChange={noop} onItemsPerPageChange={noop} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
