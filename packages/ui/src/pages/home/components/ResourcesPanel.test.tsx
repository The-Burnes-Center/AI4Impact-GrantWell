import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ResourcesPanel from "./ResourcesPanel";

describe("ResourcesPanel", () => {
  it("gives each resource card an h3 under the Additional resources h2", () => {
    render(<ResourcesPanel />);
    expect(screen.getByRole("heading", { level: 2, name: "Additional resources" })).toBeInTheDocument();
    const title = screen.getByRole("heading", { level: 3 });
    expect(title).toHaveAccessibleName(/^Federal grant finder\s*\(opens in new tab\)$/);
    expect(screen.getByRole("link", { name: /^Federal grant finder\s*\(opens in new tab\)/ })).toContainElement(title);
  });
});
