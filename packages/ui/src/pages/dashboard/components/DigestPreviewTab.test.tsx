import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { json, stubFetch, type RouteRequest } from "../../../test/fetch-routes";
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

  const preview = (req: RouteRequest) =>
    json({
      rendered: { subject: "Digest", html: "<p>x</p>", text: `${req.url.searchParams.get("frequency") ?? "daily"} text` },
      count: 1,
    });

  it("moves focus with the check when arrowing through the frequency radios", async () => {
    stubFetch({ "GET /notification-digest/preview": preview });
    const { user } = renderApp(<DigestPreviewTab apiClient={testApiClient()} addNotification={vi.fn()} />);
    const daily = await screen.findByRole("radio", { name: "Daily" });
    const weekly = screen.getByRole("radio", { name: "Weekly" });

    daily.focus();
    await user.keyboard("{ArrowRight}");
    expect(weekly).toHaveFocus();
    expect(weekly).toBeChecked();
    expect(weekly).toHaveAttribute("tabindex", "0");
    expect(daily).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{ArrowLeft}");
    expect(daily).toHaveFocus();
    expect(daily).toBeChecked();
  });

  it("lets the keyboard reach the plain-text preview", async () => {
    stubFetch({ "GET /notification-digest/preview": preview });
    renderApp(<DigestPreviewTab apiClient={testApiClient()} addNotification={vi.fn()} />);
    const text = await screen.findByRole("region", { name: "Plain text digest" });
    expect(text).toHaveAttribute("tabindex", "0");
  });

  it("announces a load error from a status region", async () => {
    stubFetch({ "GET /notification-digest/preview": json({ message: "nope" }, 500) });
    renderApp(<DigestPreviewTab apiClient={testApiClient()} addNotification={vi.fn()} />);
    await screen.findByRole("button", { name: "Retry" });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Could not load the digest preview.")
    );
  });
});
