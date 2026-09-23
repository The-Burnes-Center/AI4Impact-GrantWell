import { useState } from "react";
import { setUpTOTP, verifyTOTPSetup, updateMFAPreference } from "aws-amplify/auth";
import Button from "../ui/Button";
import OtpInput from "./OtpInput";
import TotpEnrollment from "./TotpEnrollment";
import MfaRecoveryNote from "./MfaRecoveryNote";
import { useBranding } from "../../common/branding";

interface MfaSetupPanelProps {
  email: string;
  onEnrolled: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
}

/**
 * Self-service TOTP enrolment, for use outside the sign-in challenge.
 *
 * The sign-in flow receives totpSetupDetails from Cognito when MFA is REQUIRED. With MFA
 * OPTIONAL that challenge never fires, so we start the enrolment ourselves via setUpTOTP.
 */
export default function MfaSetupPanel({
  email,
  onEnrolled,
  onCancel,
  cancelLabel = "Cancel",
}: MfaSetupPanelProps) {
  const branding = useBranding();
  const [setup, setSetup] = useState<{ uri: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      const details = await setUpTOTP();
      setSetup({
        uri: details.getSetupUri(branding.appName, email).toString(),
        secret: details.sharedSecret,
      });
    } catch (err) {
      console.error("Could not start TOTP setup", err);
      setError("Could not start two-step verification setup. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (code.trim().length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyTOTPSetup({ code: code.trim() });
      // Verifying alone does not enable it on the account.
      await updateMFAPreference({ totp: "PREFERRED" });
      onEnrolled();
    } catch (err) {
      console.error("Could not verify TOTP setup", err);
      setCode("");
      setError("That code was not accepted. Check your authenticator app and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!setup) {
    return (
      <div>
        {error && (
          <div className="profile-alert profile-alert--error" role="alert">
            {error}
          </div>
        )}
        <div className="profile-actions">
          <Button type="button" onClick={begin} loading={busy}>
            Set up two-step verification
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={confirm}>
      {error && (
        <div className="profile-alert profile-alert--error" role="alert">
          {error}
        </div>
      )}
      <TotpEnrollment setupUri={setup.uri} secret={setup.secret} />
      <div className="profile-section">
        <span className="profile-field-label" id="mfa-panel-code-label">
          Verification code
        </span>
        <OtpInput
          value={code}
          onChange={setCode}
          idPrefix="mfa-panel"
          labelId="mfa-panel-code-label"
          loading={busy}
          invalid={Boolean(error)}
        />
      </div>
      <MfaRecoveryNote />
      <div className="profile-actions">
        <Button type="submit" loading={busy}>
          Turn on two-step verification
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
        )}
      </div>
    </form>
  );
}
