import { useBranding } from "../../common/branding";

export default function MfaRecoveryNote() {
  const { appName, supportEmail } = useBranding();

  return (
    <p className="mfa-recovery-note">
      Lost access to your authenticator app? Contact{" "}
      {supportEmail ? (
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
      ) : (
        <>your {appName} administrator</>
      )}{" "}
      to get it reset.
    </p>
  );
}
