import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes, useLocation, useNavigate } from "react-router";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { renderApp } from "../../test/render";

function Where() {
  const { pathname } = useLocation();
  return <p data-testid="where">{pathname}</p>;
}

function AddSearch() {
  const navigate = useNavigate();
  return <button onClick={() => navigate("?q=1")}>Add search</button>;
}

describe("Not Found", () => {
  it("shows on an unknown path instead of redirecting", async () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderApp(
      <>
        <App />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </>,
      { route: "/requirements/a/b" }
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find grants on the home page" })).toHaveAttribute("href", "/home");
    expect(screen.getByTestId("where")).toHaveTextContent("/requirements/a/b");
    expect(document.title).toBe("Page not found – GrantWell");
  });

  it("keeps its title when the search changes", async () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderApp(
      <>
        <App />
        <AddSearch />
      </>,
      { route: "/nope" }
    );
    await screen.findByRole("heading", { level: 1, name: "Page not found" });
    fireEvent.click(screen.getByRole("button", { name: "Add search" }));
    await waitFor(() => expect(document.title).toBe("Page not found – GrantWell"));
  });

  it("sends a signed-in user on the sign-in address to the home page", async () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderApp(
      <>
        <App />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </>,
      { route: "/login" }
    );
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/home"));
    expect(screen.queryByRole("heading", { level: 1, name: "Page not found" })).not.toBeInTheDocument();
  });
});
