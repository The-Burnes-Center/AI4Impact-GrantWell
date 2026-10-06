import { useEffect, useRef, useState } from "react";
import { fetchAuthSession, fetchMFAPreference } from "aws-amplify/auth";
import Button from "../ui/Button";
import Modal from "../common/Modal";
import MfaSetupPanel from "./MfaSetupPanel";
import { isMfaPromptSnoozed, snoozeMfaPrompt } from "../../common/mfa-snooze";
import { MFA_DEADLINE, MFA_DEADLINE_ISO } from "../../common/instance";
import {
  daysLeftText,
  deadlineDateText,
  deadlinePromptSeen,
  markDeadlinePromptSeen,
  mfaDeadlinePhase,
} from "../../common/mfa-deadline";
import { markSignInDialogUsed } from "../../common/sign-in-dialog";
import "../../styles/totp.css";

/**
 * Recommends two-step verification to signed-in users who have not enrolled.
 *
 * MFA is OPTIONAL in Cognito, so nothing here blocks access — every way of closing the
 * dialog snoozes the prompt for 30 days. Enrolment stays available from the profile page
 * either way. On a deployment with an MFA deadline the prompt names the date and returns at
 * every sign-in instead; from the deadline MfaGate takes over.
 */
export default function MfaPrompt({ onSettled }: { onSettled?: (shown: boolean) => void }) {
  const [visible, setVisible] = useState(false);
  const [userId, setUserId] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [authTime, setAuthTime] = useState(0);
  const [phase] = useState(() => mfaDeadlinePhase());
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let shown = false;
      try {
        const session = await fetchAuthSession();
        const claims = session.tokens?.idToken?.payload ?? {};
        const sub = typeof claims.sub === "string" ? claims.sub : "";
        const mail = typeof claims.email === "string" ? claims.email : "";
        const signedInAt = typeof claims.auth_time === "number" ? claims.auth_time : 0;
        if (!sub || phase === "after") return;
        if (phase === "none" && isMfaPromptSnoozed(sub)) return;
        if (phase === "before" && deadlinePromptSeen(sub, signedInAt)) return;

        const pref = await fetchMFAPreference();
        const enrolled = pref.enabled?.includes("TOTP") || pref.preferred === "TOTP";
        if (cancelled || enrolled) return;

        setUserId(sub);
        setEmail(mail);
        setAuthTime(signedInAt);
        markSignInDialogUsed({ userId: sub, authTime: signedInAt });
        setVisible(true);
        shown = true;
      } catch (err) {
        // Never let this block the app.
        console.error("Could not check MFA status", err);
      } finally {
        if (!cancelled) onSettledRef.current?.(shown);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase]);

  if (!visible) return null;

  // Escape, the overlay and the X all land here, so they read as "Not now".
  const dismiss = () => {
    if (phase === "before") markDeadlinePromptSeen(userId, authTime);
    else snoozeMfaPrompt(userId);
    setVisible(false);
  };

  if (done) {
    return (
      <Modal
        isOpen
        onClose={() => setVisible(false)}
        title="Two-step verification is on"
        maxWidth="480px"
      >
        <p className="mfa-prompt-body">
          You will be asked for a code from your authenticator app the next time you sign
          in.
        </p>
        <div className="profile-actions">
          <Button type="button" onClick={() => setVisible(false)}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen
      onClose={dismiss}
      title={
        phase === "before" && MFA_DEADLINE_ISO
          ? `Two-step verification is required from ${deadlineDateText(MFA_DEADLINE_ISO, false)}`
          : "Add two-step verification"
      }
      maxWidth={expanded ? "560px" : "480px"}
    >
      {phase === "before" && MFA_DEADLINE_ISO && MFA_DEADLINE !== null ? (
        <p className="mfa-prompt-body">
          Starting {deadlineDateText(MFA_DEADLINE_ISO, true)}, you&apos;ll need a code from an
          authenticator app to sign in to GrantWell. Setting it up takes about a minute.{" "}
          <strong>{daysLeftText(Date.now(), MFA_DEADLINE)}</strong>
        </p>
      ) : (
        <p className="mfa-prompt-body">
          Recommended. It protects your grant drafts if your password is ever guessed or
          reused. Takes about a minute with an authenticator app.
        </p>
      )}

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
    </Modal>
  );
}
