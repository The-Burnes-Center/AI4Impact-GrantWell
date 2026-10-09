import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { auth } from "../../test/amplify";
import MfaSetupPanel from "./MfaSetupPanel";

function renderPanel() {
  const onEnrolled = vi.fn();
  const user = userEvent.setup();
  render(
    <StrictMode>
      <MfaSetupPanel email="user@example.com" onEnrolled={onEnrolled} onCancel={() => {}} />
    </StrictMode>
  );
  return { onEnrolled, user };
}

async function enterCode(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.click(screen.getByLabelText("Digit 1 of 6"));
  await user.keyboard(code);
}

describe("MfaSetupPanel", () => {
  it("shows the QR code and secret as soon as it opens, with one setUpTOTP even under StrictMode", async () => {
    renderPanel();
    expect(await screen.findByText("SECRET123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn on two-step verification" })).toBeInTheDocument();
    expect(auth.setUpTOTP).toHaveBeenCalledTimes(1);
  });

  it("verifies the code and makes TOTP the preferred method before reporting enrolment", async () => {
    const { onEnrolled, user } = renderPanel();
    await screen.findByText("SECRET123");
    await enterCode(user, "123456");
    await user.click(screen.getByRole("button", { name: "Turn on two-step verification" }));

    expect(auth.verifyTOTPSetup).toHaveBeenCalledWith({ code: "123456" });
    expect(auth.updateMFAPreference).toHaveBeenCalledWith({ totp: "PREFERRED" });
    expect(onEnrolled).toHaveBeenCalledTimes(1);
  });

  it("keeps the panel open with an error when the code is rejected", async () => {
    auth.verifyTOTPSetup.mockRejectedValue(new Error("CodeMismatchException"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { onEnrolled, user } = renderPanel();
    await screen.findByText("SECRET123");
    await enterCode(user, "000000");
    await user.click(screen.getByRole("button", { name: "Turn on two-step verification" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That code was not accepted.");
    expect(onEnrolled).not.toHaveBeenCalled();
  });

  it("offers Try again when setup can't start", async () => {
    auth.setUpTOTP.mockRejectedValueOnce(new Error("network"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = renderPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not start two-step verification setup.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("SECRET123")).toBeInTheDocument();
  });
});
