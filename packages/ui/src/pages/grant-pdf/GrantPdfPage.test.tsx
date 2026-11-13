import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import GrantPdfPage from "./GrantPdfPage";

const replace = vi.fn();
const realLocation = window.location;

describe("GrantPdfPage", () => {
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
    replace.mockReset();
  });

  it("replaces itself with the signed PDF link at the cited page", async () => {
    Object.defineProperty(window, "location", { configurable: true, value: { ...realLocation, replace } });
    const { calls } = stubFetch({ "GET /grant-pdf-url": json({ available: true, signedUrl: "https://s3.test/g?X-Amz-Signature=a" }) });
    renderApp(<GrantPdfPage />, { route: "/grant-pdf?grant=Bridge%20Grant&page=7" });

    expect(screen.getByRole("heading", { level: 1, name: "Opening the grant" })).toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("https://s3.test/g?X-Amz-Signature=a#page=7"));
    expect(calls[0].url.searchParams.get("grant")).toBe("Bridge Grant");
  });

  it("explains a text-only grant and links to its requirements", async () => {
    stubFetch({ "GET /grant-pdf-url": json({ available: false }) });
    renderApp(<GrantPdfPage />, { route: "/grant-pdf?grant=Text%20Grant" });

    expect(await screen.findByRole("heading", { level: 1, name: "Grant PDF not available" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("isn't a PDF");
    expect(screen.getByRole("link", { name: "Go to the grant's requirements" })).toHaveAttribute("href", "/requirements/Text%20Grant");
  });

  it("says when there is no PDF it can open", async () => {
    stubFetch({ "GET /grant-pdf-url": json({ message: "No PDF for this grant" }, 404) });
    renderApp(<GrantPdfPage />, { route: "/grant-pdf?grant=Other%20State%20Grant" });

    expect(await screen.findByRole("status")).toHaveTextContent("couldn't find a PDF");
    expect(screen.getByRole("link", { name: "Find grants on the home page" })).toHaveAttribute("href", "/home");
  });
});
