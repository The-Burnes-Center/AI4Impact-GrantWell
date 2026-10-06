import React, { useCallback, useEffect, useState } from "react";
import { fetchAuthSession, fetchMFAPreference, signOut } from "aws-amplify/auth";
import { LuShieldCheck } from "react-icons/lu";
import Button from "../ui/Button";
import MfaSetupPanel from "./MfaSetupPanel";
import MfaRecoveryNote from "./MfaRecoveryNote";
import { useFocusTrap } from "../../hooks/use-focus-trap";
import { MFA_DEADLINE_ISO } from "../../common/instance";
import { deadlineDateText, mfaDeadlinePhase } from "../../common/mfa-deadline";
import "../profile-gate/profile-gate.css";
import "../../styles/totp.css";

/**
 * From the deployment's MFA deadline, blocks the app until the user enrolls. Fails open like
 * ProfileGate: the user pool's own MFA requirement is the real enforcement.
 */
export default function MfaGate({ children }: { children: React.ReactNode }) {
  const [phase] = useState(() => mfaDeadlinePhase());
  const [blocked, setBlocked] = useState(false);
  const [email, setEmail] = useState("");
  const [expanded, setExpanded] = useState(false);
  const dialogRef = useFocusTrap<HTMLDivElement>({ isOpen: blocked });

  useEffect(() => {
    if (phase !== "after") return;
    let active = true;
    (async () => {
      try {
        const session = await fetchAuthSession();
        const claims = session.tokens?.idToken?.payload ?? {};
        const pref = await fetchMFAPreference();
        const enrolled = pref.enabled?.includes("TOTP") || pref.preferred === "TOTP";
        if (!active || enrolled) return;
        setEmail(typeof claims.email === "string" ? claims.email : "");
        setBlocked(true);
      } catch (err) {
        console.error("Could not check MFA status", err);
      }
    })();
    return () => {
      active = false;
    };
  }, [phase]);

  const onSignOut = useCallback(async () => {
    try {
      await signOut();
    } catch (err) {
      console.error("Error signing out:", err);
    } finally {
      window.location.assign("/");
    }
  }, []);

  if (!blocked) return <>{children}</>;

  return (
    <div
      className="profile-gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mfa-gate-title"
      ref={dialogRef}
    >
      <div className={`profile-gate__panel${expanded ? " profile-gate__panel--wide" : ""}`}>
        <header className="profile-gate__header">
          <span className="profile-gate__header-icon" aria-hidden="true">
            <LuShieldCheck size={22} />
          </span>
          <h2 className="profile-gate__title" id="mfa-gate-title">
            Set up two-step verification to continue
          </h2>
        </header>

        <div className="profile-gate__body">
          <p className="profile-gate__lead">
            Since {MFA_DEADLINE_ISO ? deadlineDateText(MFA_DEADLINE_ISO, true) : "the deadline"},
            GrantWell asks for a code from an authenticator app when you sign in. Set it up to
            keep using GrantWell. It takes about a minute.
          </p>

          {expanded ? (
            <MfaSetupPanel
              email={email}
              onEnrolled={() => setBlocked(false)}
              onCancel={() => setExpanded(false)}
              cancelLabel="Back"
            />
          ) : (
            <>
              <div className="profile-actions">
                <Button type="button" onClick={() => setExpanded(true)}>
                  Set it up
                </Button>
                <Button type="button" variant="ghost" onClick={onSignOut}>
                  Sign out
                </Button>
              </div>
              <MfaRecoveryNote />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
