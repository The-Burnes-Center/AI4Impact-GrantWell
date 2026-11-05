import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "../../../test/fetch-routes";
import { renderApp, testApiClient } from "../../../test/render";
import DigestPreviewTab from "./DigestPreviewTab";

describe("DigestPreviewTab", () => {
  it("previews the digest HTML in a fully sandboxed frame", async () => {
    const html = "<p>New grants</p><script>parent.alert(1)</script>";
    stubFetch({
      "GET /notification-digest/preview": json({ rendered: { subject: "Your digest", html, text: "New grants" }, count: 1 }),
    });
    renderApp(<DigestPreviewTab apiClient={testApiClient()} addNotification={vi.fn()} />);

    const frame = await screen.findByTitle("daily digest preview");
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame).toHaveAttribute("srcdoc", html);
  });
});
