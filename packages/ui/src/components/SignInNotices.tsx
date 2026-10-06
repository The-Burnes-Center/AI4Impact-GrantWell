import { useState } from "react";
import MfaPrompt from "./auth/MfaPrompt";
import WhatsNewDialog from "./whats-new/WhatsNewDialog";

/** The MFA prompt gets first claim on a sign-in; What's new waits until it has decided not to show. */
export default function SignInNotices() {
  const [mfaShown, setMfaShown] = useState<boolean | null>(null);
  return (
    <>
      <MfaPrompt onSettled={setMfaShown} />
      {mfaShown === false && <WhatsNewDialog />}
    </>
  );
}
