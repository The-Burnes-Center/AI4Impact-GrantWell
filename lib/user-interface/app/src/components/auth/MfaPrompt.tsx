import { useEffect, useState } from "react";
import { fetchAuthSession, fetchMFAPreference } from "aws-amplify/auth";
import Button from "../ui/Button";
import MfaSetupPanel from "./MfaSetupPanel";
import { isMfaPromptSnoozed, snoozeMfaPrompt } from "../../common/mfa-snooze";
import "../../styles/totp.css";

/**
 * Recommends two-step verification to signed-in users who have not enrolled.
 *
 * MFA is OPTIONAL in Cognito, so nothing here blocks access — dismissing snoozes the
 * prompt for 30 days. Enrolment stays available from the profile page either way.
 */
export default function MfaPrompt() {
  const [visible, setVisible] = useState(false);
  const [userId, setUserId] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const session = await fetchAuthSession();
        const claims = session.tokens?.idToken?.payload ?? {};
        const sub = typeof claims.sub === "string" ? claims.sub : "";
        const mail = typeof claims.email === "string" ? claims.email : "";
        if (!sub || isMfaPromptSnoozed(sub)) return;

        const pref = await fetchMFAPreference();
        const enrolled = pref.enabled?.includes("TOTP") || pref.preferred === "TOTP";
        if (cancelled || enrolled) return;

        setUserId(sub);
        setEmail(mail);
        setVisible(true);
      } catch (err) {
        // Never let this block the app.
        console.error("Could not check MFA status", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    snoozeMfaPrompt(userId);
    setVisible(false);
  };

  if (done) {
    return (
      <div className="mfa-prompt mfa-prompt--success" role="status">
        <p className="mfa-prompt-title">Two-step verification is on.</p>
        <p className="mfa-prompt-body">
          You will be asked for a code from your authenticator app the next time you sign in.
        </p>
        <div className="profile-actions">
          <Button type="button" variant="secondary" onClick={() => setVisible(false)}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section className="mfa-prompt" aria-labelledby="mfa-prompt-title">
      <p className="mfa-prompt-title" id="mfa-prompt-title">
        Add two-step verification
      </p>
      <p className="mfa-prompt-body">
        Recommended. It protects your grant drafts if your password is ever guessed or
        reused. Takes about a minute with an authenticator app.
      </p>

      {expanded ? (
        <MfaSetupPanel
          email={email}
          onEnrolled={() => setDone(true)}
          onCancel={() => setExpanded(false)}
          cancelLabel="Back"
        />
      ) : (
        <div className="profile-actions">
          <Button type="button" onClick={() => setExpanded(true)}>
            Set it up
          </Button>
          <Button type="button" variant="ghost" onClick={dismiss}>
            Not now
          </Button>
        </div>
      )}
    </section>
  );
}
