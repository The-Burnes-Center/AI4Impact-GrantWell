import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { signedInAs } from "../test/amplify";
import { instance } from "../test/instance";
import AuthPanel from "./auth/AuthPanel";
import StateSiteNotice from "./StateSiteNotice";

const colorado = { state: "CO", url: "https://colorado.grantwell.us" };

beforeEach(() => {
  instance.SUPPORTED_STATES = [
    { code: "CO", name: "Colorado" },
    { code: "MA", name: "Massachusetts" },
  ];
  instance.STATE_SITES = [colorado];
});

const signUpForm = () => screen.getByRole("form", { name: "Create account form" });

describe("signing up for a state with its own site", () => {
  it("sends the user there with their email instead of creating an account here", async () => {
    const user = userEvent.setup();
    render(<AuthPanel onAuthenticated={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await user.type(screen.getByLabelText(/Email address/), "pat@example.org");
    await user.selectOptions(screen.getByLabelText(/State/), "CO");

    expect(screen.getByText("Colorado has its own GrantWell site. Create your account there.")).toBeInTheDocument();
    const link = within(signUpForm()).getByRole("link", { name: "Go to GrantWell Colorado" });
    expect(link).toHaveAttribute("href", "https://colorado.grantwell.us/#sign-up=&email=pat%40example.org");
    expect(within(signUpForm()).queryByRole("button", { name: "Create account" })).toBeNull();
  });

  it("creates an account here as usual for a state without one", async () => {
    const user = userEvent.setup();
    render(<AuthPanel onAuthenticated={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await user.selectOptions(screen.getByLabelText(/State/), "MA");

    expect(within(signUpForm()).getByRole("button", { name: "Create account" })).toBeInTheDocument();
    expect(screen.queryByText(/has its own GrantWell site/)).toBeNull();
  });
});

describe("arriving from a hand-off", () => {
  it("opens Create account with the email filled in, then clears the fragment", async () => {
    window.history.replaceState(null, "", "/#sign-up=&email=pat%40example.org");
    render(<AuthPanel onAuthenticated={() => {}} />);

    expect(screen.getByLabelText(/Email address/)).toHaveValue("pat@example.org");
    expect(signUpForm()).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe(""));
  });

  it("opens sign-in when the page has no hand-off", () => {
    window.history.replaceState(null, "", "/");
    render(<AuthPanel onAuthenticated={() => {}} />);
    expect(screen.getByRole("form", { name: /sign in/i })).toBeInTheDocument();
  });
});

describe("notice for existing users of that state", () => {
  it("tells them where their state's site is, until they close it for the session", async () => {
    signedInAs({ "custom:state": "CO" });
    const user = userEvent.setup();
    const { unmount } = render(<StateSiteNotice />);

    const notice = await screen.findByRole("complementary", { name: "Colorado has its own GrantWell" });
    expect(notice).toHaveTextContent("Colorado now has its own GrantWell at colorado.grantwell.us. Your chats and applications will move there soon.");
    expect(within(notice).getByRole("link", { name: "colorado.grantwell.us" })).toHaveAttribute("href", "https://colorado.grantwell.us");

    await user.click(within(notice).getByRole("button", { name: "Dismiss this notice" }));
    expect(screen.queryByRole("complementary")).toBeNull();
    unmount();
    render(<StateSiteNotice />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("stays away for users of other states", async () => {
    signedInAs({ "custom:state": "MA" });
    render(<StateSiteNotice />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
