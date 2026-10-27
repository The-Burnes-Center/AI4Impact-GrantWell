import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { instance } from "../../test/instance";
import { renderApp } from "../../test/render";
import ProfileGate from "./ProfileGate";

const PROFILE = "GET /user-profile";
const SAVE = "PUT /user-profile";
const empty = { agency: "", organization: "", jobTitle: "", region: "", state: "", profileComplete: false };

function renderGate(profile = empty) {
  const net = stubFetch({
    [PROFILE]: json(profile),
    [SAVE]: (req) => json({ ...profile, ...(req.body as object), profileComplete: true }),
  });
  return { net, ...renderApp(<ProfileGate>app</ProfileGate>) };
}

async function fillOrgFields(user: ReturnType<typeof renderApp>["user"]) {
  const department = await screen.findByLabelText(/Department/);
  // The focus trap focuses the first field 100 ms after opening; typing before then lands in the wrong field.
  await waitFor(() => expect(department).toHaveFocus());
  await user.type(department, "DOT");
  await user.type(screen.getByLabelText(/Organization/), "City of Denver");
  await user.type(screen.getByLabelText(/Role \/ Title/), "Grants Manager");
}

describe("ProfileGate region", () => {
  it("asks no region on a deployment without regions", async () => {
    const { net, user } = renderGate();
    await fillOrgFields(user);
    expect(screen.queryByLabelText(/Region/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /Save and continue/ }));
    expect(await screen.findByText("app")).toBeInTheDocument();
    expect(net.to(SAVE)[0].body).toEqual({ agency: "DOT", organization: "City of Denver", jobTitle: "Grants Manager" });
  });

  it("requires a region from the list and saves it", async () => {
    instance.REGIONS = ["Region 1", "Region 2"];
    const { net, user } = renderGate();
    await fillOrgFields(user);
    expect(screen.getByRole("button", { name: /Save and continue/ })).toBeDisabled();
    const region = screen.getByLabelText(/Region/);
    expect(region).toBeRequired();
    await user.selectOptions(region, "Region 2");
    await user.click(screen.getByRole("button", { name: /Save and continue/ }));
    expect(await screen.findByText("app")).toBeInTheDocument();
    expect(net.to(SAVE)[0].body).toEqual({
      agency: "DOT",
      organization: "City of Denver",
      jobTitle: "Grants Manager",
      region: "Region 2",
    });
  });

  it("asks again when the saved region is no longer listed", async () => {
    instance.REGIONS = ["Region 1"];
    renderGate({ ...empty, agency: "DOT", organization: "Denver", jobTitle: "Manager", region: "Old region" });
    expect(await screen.findByLabelText(/Region/)).toHaveValue("");
  });
});
