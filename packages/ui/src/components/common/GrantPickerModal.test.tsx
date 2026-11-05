import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import GrantPickerModal from "./GrantPickerModal";

vi.mock("../../common/helpers/recently-viewed-nofos", () => ({ fetchRecentlyViewed: async (): Promise<never[]> => [] }));

describe("GrantPickerModal", () => {
  it("offers a live grant while a new version of it is processed, and no grant held for review", async () => {
    stubFetch({
      "GET /s3-nofo-bucket-data": json({
        nofoData: [
          { name: "Rerun Grant", status: "active", processing_status: "checking_sources" },
          { name: "Plain Grant", status: "active" },
          { name: "Old Grant", status: "archived" },
          { name: "New Grant", status: "processing", processing_status: "extracting_text" },
          { name: "Held Grant", status: "quarantined", processing_status: "quarantined" },
        ],
      }),
    });
    renderApp(<GrantPickerModal isOpen onClose={() => {}} onSelect={() => {}} title="Pick a grant" description="Choose one." />);

    await screen.findByRole("button", { name: "Plain Grant" });
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Plain Grant", "Rerun Grant"]);
  });
});
