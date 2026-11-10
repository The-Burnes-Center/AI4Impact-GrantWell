import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { mfaEnrolled } from "../../test/amplify";
import { instance, withMfaDeadline } from "../../test/instance";
import { renderApp } from "../../test/render";
import ProfilePage from "./ProfilePage";
import { NavigationProvider } from "../../components/navigation/NavigationProvider";
import { useNavigationChrome } from "../../components/navigation/navigation-context";
import { GRANT_CATEGORIES } from "../../common/types/nofo";

vi.mock("../../components/navigation/UnifiedNavigation", () => ({ default: (): null => null }));

const PREFS = "GET /notification-prefs";
const SAVE_PREFS = "PUT /notification-prefs";
const PROFILE = "GET /user-profile";

const savedPrefs = { frequency: "weekly", state: "MA", categories: ["Arts"], keywords: ["broadband"], last_sent: null as string | null };

function renderProfile(prefs: Response = json(savedPrefs)) {
  const net = stubFetch({
    [PROFILE]: json({ agency: "", organization: "", jobTitle: "" }),
    [PREFS]: prefs,
    [SAVE_PREFS]: (req) => json({ ...savedPrefs, ...(req.body as object) }),
    "GET /s3-nofo-bucket-data": json({ nofoData: GRANT_CATEGORIES.map((category) => ({ category })) }),
  });
  return { net, ...renderApp(<ProfilePage />, { route: "/profile" }) };
}

const prefsLoaded = () => screen.findByRole("button", { name: "Save preferences" });

describe("ProfilePage notification preferences", () => {
  it("loads saved preferences and enables Save only once something changes", async () => {
    renderProfile();
    await prefsLoaded();
    expect(screen.getByRole("radio", { name: "Weekly digest" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Arts" })).toBeChecked();
    expect(screen.getByLabelText("Keywords (comma-separated)")).toHaveValue("broadband");
    expect(screen.getByRole("button", { name: "Save preferences" })).toBeDisabled();
  });

  it("saves keywords as a trimmed list and confirms", async () => {
    const { net, user } = renderProfile();
    await prefsLoaded();
    const keywords = screen.getByLabelText("Keywords (comma-separated)");
    await user.clear(keywords);
    await user.type(keywords, " broadband,  workforce , ");
    await user.click(screen.getByRole("checkbox", { name: "Agriculture" }));
    await user.click(screen.getByRole("button", { name: "Save preferences" }));

    expect(await screen.findByText("Preferences saved.")).toBeInTheDocument();
    expect(net.to(SAVE_PREFS)[0].body).toEqual({
      frequency: "weekly",
      categories: ["Arts", "Agriculture"],
      keywords: ["broadband", "workforce"],
    });
    expect(screen.getByRole("button", { name: "Save preferences" })).toBeDisabled();
  });

  it("offers only categories that have grants, keeping ones already chosen", async () => {
    stubFetch({
      [PROFILE]: json({ agency: "", organization: "", jobTitle: "" }),
      [PREFS]: json(savedPrefs),
      "GET /s3-nofo-bucket-data": json({ nofoData: [{ category: "Health" }, { category: "Agriculture" }, { category: "Health" }, { category: null }] }),
    });
    renderApp(<ProfilePage />, { route: "/profile" });
    await prefsLoaded();

    expect(await screen.findByRole("checkbox", { name: "Health" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Agriculture" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Arts" })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Recovery Act" })).not.toBeInTheDocument();
    expect(screen.getByText("1 of 3 selected")).toBeInTheDocument();
  });

  it("disables the filters while digests are off", async () => {
    const { user } = renderProfile();
    await prefsLoaded();
    await user.click(screen.getByRole("radio", { name: "Off" }));
    expect(screen.getByRole("checkbox", { name: "Arts" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save preferences" })).toBeEnabled();
    // aria-disabled="false" would tell axe these are enabled and fail them on the dimmed fieldset's contrast.
    for (const name of ["Select all", "Clear"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).not.toHaveAttribute("aria-disabled", "false");
    }
  });

  it("says so when the preferences can't be loaded", async () => {
    renderProfile(json({ message: "boom" }, 500));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your notification preferences.");
  });

  it("hides the section and never asks for preferences on a deployment without digests", async () => {
    instance.EMAIL_DIGEST = false;
    const { net } = renderProfile();
    await screen.findByRole("navigation", { name: "Profile sections" });
    expect(screen.queryByText("Notification preferences")).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Profile sections" })).queryByText("Notifications")).toBeNull();
    expect(net.to(PREFS)).toHaveLength(0);
  });
});

describe("ProfilePage region", () => {
  const SAVE_PROFILE = "PUT /user-profile";
  const saved = { agency: "DOT", organization: "Denver", jobTitle: "Manager", region: "Region 1", state: "CO", profileComplete: true };

  function renderWithProfile() {
    const net = stubFetch({
      [PROFILE]: json(saved),
      [PREFS]: json(savedPrefs),
      [SAVE_PROFILE]: (req) => json({ ...saved, ...(req.body as object) }),
      "GET /s3-nofo-bucket-data": json({ nofoData: [] }),
    });
    return { net, ...renderApp(<ProfilePage />, { route: "/profile" }) };
  }

  it("shows no region field on a deployment without regions", async () => {
    renderWithProfile();
    await screen.findByRole("textbox", { name: "Department" });
    expect(screen.queryByRole("combobox", { name: "Region" })).toBeNull();
  });

  it("changes the region with the other organization details", async () => {
    instance.REGIONS = ["Region 1", "Region 2"];
    const { net, user } = renderWithProfile();
    const region = await screen.findByRole("combobox", { name: "Region" });
    await screen.findByDisplayValue("DOT");
    expect(region).toHaveValue("Region 1");
    await user.selectOptions(region, "Region 2");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Organization details saved.")).toBeInTheDocument();
    expect(net.to(SAVE_PROFILE)[0].body).toEqual({ agency: "DOT", organization: "Denver", jobTitle: "Manager", region: "Region 2" });
  });
  it("marks an empty required field, links its message and moves focus there instead of saving", async () => {
    const { net, user } = renderWithProfile();
    const department = await screen.findByRole("textbox", { name: "Department" });
    await screen.findByDisplayValue("DOT");
    await user.clear(department);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(department).toHaveAttribute("aria-invalid", "true");
    expect(department).toHaveAccessibleDescription("Enter your department");
    expect(department).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("Fill in the fields marked below.");
    expect(net.to(SAVE_PROFILE)).toHaveLength(0);
    await user.type(department, "DOT");
    expect(department).not.toHaveAttribute("aria-invalid");
  });
});

describe("ProfilePage form semantics", () => {
  it("groups the frequency radios and the categories under their legends", async () => {
    renderProfile();
    await prefsLoaded();
    expect(within(screen.getByRole("group", { name: "Email frequency" })).getByRole("radio", { name: "Weekly digest" })).toBeChecked();
    expect(within(screen.getByRole("group", { name: "Categories" })).getByRole("checkbox", { name: "Arts" })).toBeChecked();
  });

  it("stops the organization fields at the 200 characters the server keeps", async () => {
    renderProfile();
    for (const label of ["Department", "Organization", "Role / Title"]) {
      expect(await screen.findByRole("textbox", { name: label })).toHaveAttribute("maxlength", "200");
    }
  });

  it("autocompletes the organization fields and shows the password rules with a show-password toggle", async () => {
    const { user } = renderProfile();
    expect(await screen.findByRole("textbox", { name: "Organization" })).toHaveAttribute("autocomplete", "organization");
    expect(screen.getByRole("textbox", { name: "Role / Title" })).toHaveAttribute("autocomplete", "organization-title");

    await user.click(screen.getByRole("button", { name: "Change password" }));
    const current = screen.getByLabelText("Current password");
    const next = screen.getByLabelText("New password");
    expect(current).toHaveAttribute("autocomplete", "current-password");
    expect(next).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute("autocomplete", "new-password");
    expect(next).toHaveAccessibleDescription(/at least 8 characters/);

    await user.click(screen.getByRole("checkbox", { name: "Show passwords" }));
    expect(current).toHaveAttribute("type", "text");
    expect(next).toHaveAttribute("type", "text");
  });
});

describe("ProfilePage two-step verification", () => {
  it("offers Turn off when MFA is optional", async () => {
    mfaEnrolled(true);
    renderProfile();
    expect(await screen.findByText(/On. You are asked for a code/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn off" })).toBeInTheDocument();
  });

  it("can't be turned off when the pool requires MFA without a deadline", async () => {
    instance.MFA_REQUIRED = true;
    mfaEnrolled(true);
    renderProfile();
    expect(
      await screen.findByText("On. Two-step verification is required on GrantWell, so it can't be turned off.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn off" })).toBeNull();
  });

  it("says it is required when it is off on a pool that requires MFA", async () => {
    instance.MFA_REQUIRED = true;
    renderProfile();
    expect(await screen.findByText("Off. Two-step verification is required on GrantWell.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set up two-step verification" })).toBeInTheDocument();
  });

  it("names the deadline when there is one", async () => {
    instance.MFA_REQUIRED = true;
    withMfaDeadline("2026-11-02T00:00:00-05:00");
    mfaEnrolled(true);
    renderProfile();
    expect(await screen.findByText(/GrantWell requires it from November 2, 2026, so it can.t be turned off/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn off" })).toBeNull();
  });
});

describe("ProfilePage unsaved changes", () => {
  function LeaveButton({ onLeave }: { onLeave: () => void }) {
    const chrome = useNavigationChrome();
    return <button onClick={() => chrome?.runGuarded(onLeave)}>Go elsewhere</button>;
  }

  function renderGuarded(onLeave: () => void) {
    stubFetch({
      [PROFILE]: json({ agency: "DOT", organization: "Denver", jobTitle: "Manager" }),
      [PREFS]: json(savedPrefs),
      "GET /s3-nofo-bucket-data": json({ nofoData: [] }),
    });
    return renderApp(
      <NavigationProvider>
        <ProfilePage />
        <LeaveButton onLeave={onLeave} />
      </NavigationProvider>,
      { route: "/profile" }
    );
  }

  it("asks before leaving with unsaved changes, and leaves straight away without them", async () => {
    const onLeave = vi.fn();
    const { user } = renderGuarded(onLeave);
    await prefsLoaded();

    await user.click(screen.getByRole("button", { name: "Go elsewhere" }));
    expect(onLeave).toHaveBeenCalledTimes(1);

    const department = await screen.findByLabelText(/Department/);
    await user.clear(department);
    await user.type(department, "Planning");
    await user.click(screen.getByRole("button", { name: "Go elsewhere" }));
    const dialog = await screen.findByRole("dialog", { name: "Leave without saving?" });
    await user.click(within(dialog).getByRole("button", { name: "Stay on this page" }));
    expect(onLeave).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Go elsewhere" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Leave without saving?" })).getByRole("button", { name: "Leave without saving" }));
    expect(onLeave).toHaveBeenCalledTimes(2);
  });
});
