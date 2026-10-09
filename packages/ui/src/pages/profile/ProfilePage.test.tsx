import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { instance } from "../../test/instance";
import { renderApp } from "../../test/render";
import ProfilePage from "./ProfilePage";

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
    expect(screen.getByLabelText("Comma-separated")).toHaveValue("broadband");
    expect(screen.getByRole("button", { name: "Save preferences" })).toBeDisabled();
  });

  it("saves keywords as a trimmed list and confirms", async () => {
    const { net, user } = renderProfile();
    await prefsLoaded();
    const keywords = screen.getByLabelText("Comma-separated");
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

  it("disables the filters while digests are off", async () => {
    const { user } = renderProfile();
    await prefsLoaded();
    await user.click(screen.getByRole("radio", { name: "Off" }));
    expect(screen.getByRole("checkbox", { name: "Arts" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save preferences" })).toBeEnabled();
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
