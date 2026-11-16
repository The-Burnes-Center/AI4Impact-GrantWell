import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { instance } from "../../test/instance";
import { renderApp } from "../../test/render";
import ProfileGate from "../profile-gate/ProfileGate";
import type { ProfileForm } from "../../common/instance";
import { toggleLocation, withType } from "./profile-form-logic";

const FORM: ProfileForm = {
  title: "Tell us who you represent",
  lead: "We use this information to tell us who is using GrantWell.",
  applicantTypes: [
    { name: "State Government / Agency", organization: "entity", location: false },
    { name: "501(c)(3) Nonprofit", organization: "name", location: true },
    { name: "Individual / Public", organization: "none", location: true, defaultRole: "Individual / Community Member" },
  ],
  entities: { label: "State entity", choices: ["Office of the Governor", "Department of Transportation (CDOT)", "Department of Revenue (DOR)"] },
  locations: { label: "County", all: "Statewide / Multi-County", choices: ["Adams", "Denver", "Jefferson"] },
};

const PROFILE = "GET /user-profile";
const SAVE = "PUT /user-profile";
const oldProfile = { agency: "DOT", organization: "City of Denver", jobTitle: "Manager", region: "Region 1", state: "CO", profileComplete: false };

function renderGate(profile: object = oldProfile) {
  const net = stubFetch({
    [PROFILE]: json(profile),
    [SAVE]: (req) => json({ ...(req.body as object), state: "CO", profileComplete: true }),
  });
  return { net, ...renderApp(<ProfileGate>app</ProfileGate>) };
}

async function openGate() {
  const type = await screen.findByLabelText(/Applicant type/);
  await waitFor(() => expect(type).toHaveFocus());
  return type;
}

beforeEach(() => {
  instance.PROFILE_FORM = FORM;
});

describe("profile step with PROFILE_FORM", () => {
  it("starts empty for a profile saved by the old form, under the configured heading", async () => {
    renderGate();
    expect(await screen.findByRole("heading", { name: FORM.title })).toBeInTheDocument();
    expect(screen.getByText(FORM.lead)).toBeInTheDocument();
    expect(await openGate()).toHaveValue("");
    expect(screen.getByLabelText(/Your role/)).toHaveValue("");
    expect(screen.queryByLabelText(/Department/)).toBeNull();
    expect(screen.queryByLabelText(/Region/)).toBeNull();
  });

  it("asks a nonprofit for its name and counties, and saves only those", async () => {
    const { net, user } = renderGate();
    await user.selectOptions(await openGate(), "501(c)(3) Nonprofit");
    expect(screen.queryByLabelText(/State entity/)).toBeNull();
    await user.type(screen.getByLabelText(/Organization name/), "Mile High Youth");
    await user.type(screen.getByLabelText(/Your role/), "Grants Manager");
    const county = screen.getByRole("combobox", { name: /County/ });
    await user.type(county, "den");
    const list = screen.getByRole("listbox", { name: /County choices/ });
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(["Denver"]);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByRole("list", { name: /Selected: county/ })).toHaveTextContent("Denver");
    await user.click(screen.getByRole("button", { name: /Save and continue/ }));
    expect(await screen.findByText("app")).toBeInTheDocument();
    expect(net.to(SAVE)[0].body).toEqual({
      applicantType: "501(c)(3) Nonprofit",
      organization: "Mile High Youth",
      jobTitle: "Grants Manager",
      locations: ["Denver"],
    });
  });

  it("has a state agency pick its entity from the list and skips counties", async () => {
    const { net, user } = renderGate();
    await user.selectOptions(await openGate(), "State Government / Agency");
    expect(screen.queryByRole("combobox", { name: /County/ })).toBeNull();
    const entity = screen.getByRole("combobox", { name: /State entity/ });
    await user.type(entity, "transp");
    await user.keyboard("{ArrowDown}");
    expect(entity).toHaveAttribute("aria-activedescendant", "gate-organization-opt-0");
    await user.keyboard("{Enter}");
    expect(entity).toHaveValue("Department of Transportation (CDOT)");
    expect(entity).toHaveAttribute("aria-expanded", "false");
    await user.type(screen.getByLabelText(/Your role/), "Analyst");
    await user.click(screen.getByRole("button", { name: /Save and continue/ }));
    expect(await screen.findByText("app")).toBeInTheDocument();
    expect(net.to(SAVE)[0].body).toEqual({
      applicantType: "State Government / Agency",
      organization: "Department of Transportation (CDOT)",
      jobTitle: "Analyst",
      locations: [],
    });
  });

  it("fills an individual's role with the default and asks no organization", async () => {
    const { user } = renderGate();
    await user.selectOptions(await openGate(), "Individual / Public");
    expect(screen.getByLabelText(/Your role/)).toHaveValue("Individual / Community Member");
    expect(screen.queryByLabelText(/Organization name/)).toBeNull();
    expect(screen.queryByLabelText(/State entity/)).toBeNull();
    await user.selectOptions(screen.getByLabelText(/Applicant type/), "501(c)(3) Nonprofit");
    expect(screen.getByLabelText(/Your role/)).toHaveValue("");
  });

  it("marks every missing answer, focuses the first and saves nothing", async () => {
    const { net, user } = renderGate();
    await user.selectOptions(await openGate(), "501(c)(3) Nonprofit");
    await user.click(screen.getByRole("button", { name: /Save and continue/ }));
    expect(await screen.findByText("Fix the fields marked below.")).toBeInTheDocument();
    const org = screen.getByLabelText(/Organization name/);
    expect(org).toHaveFocus();
    expect(org).toHaveAttribute("aria-invalid", "true");
    expect(org).toHaveAccessibleDescription(/Enter your organization name/);
    expect(screen.getByRole("combobox", { name: /County/ })).toHaveAccessibleDescription(/Choose at least one county/);
    expect(net.to(SAVE)).toHaveLength(0);
  });

  it("rejects an entity typed but not picked from the list", async () => {
    const { net, user } = renderGate();
    await user.selectOptions(await openGate(), "State Government / Agency");
    await user.type(screen.getByRole("combobox", { name: /State entity/ }), "Department of Fun");
    await user.type(screen.getByLabelText(/Your role/), "Analyst");
    await user.click(screen.getByRole("button", { name: /Save and continue/ }));
    expect(await screen.findByText("Choose your state entity from the list")).toBeInTheDocument();
    expect(net.to(SAVE)).toHaveLength(0);
  });

  it("moves focus to the next chip when one is removed", async () => {
    const { user } = renderGate();
    await user.selectOptions(await openGate(), "501(c)(3) Nonprofit");
    const county = screen.getByRole("combobox", { name: /County/ });
    for (const name of ["Adams", "Denver"]) {
      await user.type(county, name);
      await user.keyboard("{ArrowDown}{Enter}");
    }
    await user.click(screen.getByRole("button", { name: "Remove Adams" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove Denver" })).toHaveFocus());
    expect(screen.getAllByRole("status").some((s) => s.textContent?.includes("Adams removed."))).toBe(true);
  });

  it("prefills a profile that already has an applicant type", async () => {
    renderGate({ applicantType: "501(c)(3) Nonprofit", organization: "Mile High Youth", jobTitle: "Lead", locations: ["Adams"], state: "CO", profileComplete: false });
    expect(await openGate()).toHaveValue("501(c)(3) Nonprofit");
    expect(screen.getByLabelText(/Organization name/)).toHaveValue("Mile High Youth");
    expect(screen.getByRole("list", { name: /Selected: county/ })).toHaveTextContent("Adams");
  });
});

describe("profile-form logic", () => {
  it("keeps the all option exclusive", () => {
    expect(toggleLocation(FORM, ["Adams", "Denver"], "Statewide / Multi-County")).toEqual({
      locations: ["Statewide / Multi-County"],
      message: "Statewide / Multi-County selected. Other choices cleared.",
    });
    expect(toggleLocation(FORM, ["Statewide / Multi-County"], "Adams")).toEqual({
      locations: ["Adams"],
      message: "Adams selected. Statewide / Multi-County cleared.",
    });
    expect(toggleLocation(FORM, ["Adams"], "Adams").locations).toEqual([]);
  });

  it("drops answers the new type doesn't ask", () => {
    const nonprofit = { applicantType: "501(c)(3) Nonprofit", organization: "Mile High", jobTitle: "Lead", locations: ["Adams"] };
    expect(withType(FORM, nonprofit, "State Government / Agency")).toEqual({
      applicantType: "State Government / Agency",
      organization: "",
      jobTitle: "Lead",
      locations: [],
    });
  });
});
