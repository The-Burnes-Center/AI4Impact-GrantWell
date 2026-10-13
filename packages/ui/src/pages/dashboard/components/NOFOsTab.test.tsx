import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NOFO } from "../../../common/types/nofo";
import { renderApp, testApiClient } from "../../../test/render";
import NOFOsTab from "./NOFOsTab";

const deployment = vi.hoisted(() => ({ single: null as { code: string; name: string } | null }));
vi.mock("../../../common/states", async (original) => ({
  ...(await original<typeof import("../../../common/states")>()),
  get SINGLE_STATE() {
    return deployment.single;
  },
}));

const nofo = (id: number, name: string, scope: NOFO["scope"], state: string | null = null): NOFO => ({
  id,
  name,
  status: "active",
  scope,
  state,
});
const NOFOS = [nofo(1, "Ma Grant", "state", "MA"), nofo(2, "Federal Grant", "federal"), nofo(3, "Old Grant", null)];

function renderTab() {
  return renderApp(
    <NOFOsTab
      nofos={NOFOS}
      searchQuery=""
      apiClient={testApiClient()}
      updateNofos={vi.fn()}
      uploadNofoModalOpen={false}
      setUploadNofoModalOpen={vi.fn()}
      addNotification={vi.fn()}
      isStateAdmin
      userState="MA"
    />
  );
}

const pinnable = () =>
  NOFOS.filter((n) => screen.queryByRole("button", { name: `Pin grant ${n.name}` })).map((n) => n.name);

describe("NOFOsTab row actions for a state admin", () => {
  it("only offer edits on the admin's own state grants on a multi-state deployment", () => {
    deployment.single = null;
    renderTab();
    expect(pinnable()).toEqual(["Ma Grant"]);
    expect(screen.queryByRole("button", { name: "More actions for Old Grant" })).not.toBeInTheDocument();
  });

  it("offer edits on every grant on a single-state deployment, keeping the state actions on federal ones", async () => {
    deployment.single = { code: "MA", name: "Massachusetts" };
    const { user } = renderTab();
    expect(pinnable()).toEqual(["Ma Grant", "Federal Grant", "Old Grant"]);

    await user.click(screen.getByRole("button", { name: "More actions for Federal Grant" }));
    for (const item of ["Edit", "Delete", "State guidance"]) {
      expect(screen.getByRole("menuitem", { name: item })).toBeInTheDocument();
    }
  });
});
