import { useBranding } from "../../common/branding";

interface MfaRecoveryNoteProps {
  variant: "setup" | "challenge";
}

export default function MfaRecoveryNote({ variant }: MfaRecoveryNoteProps) {
  const { appName, contactEmail } = useBranding();

  const contact = contactEmail ? (
    <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
  ) : (
    <>your {appName} administrator</>
  );

  if (variant === "challenge") {
    return (
      <p className="mfa-recovery-note">
        Lost access to your authenticator app? Contact {contact} to get it reset.
      </p>
    );
  }

  return (
    <p className="mfa-recovery-note mfa-recovery-note--warning">
      Save the setup key somewhere safe. There are no backup codes — if you lose
      access to your authenticator app, only {contact} can reset it for you.
    </p>
  );
}
