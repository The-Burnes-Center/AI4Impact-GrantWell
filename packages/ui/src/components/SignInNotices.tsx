import { useState } from "react";
import MfaPrompt from "./auth/MfaPrompt";
import WhatsNewDialog from "./whats-new/WhatsNewDialog";

/** One dialog at a time: the MFA prompt first, then What's new once it is done. */
export default function SignInNotices() {
  const [mfaDone, setMfaDone] = useState(false);
  return (
    <>
      <MfaPrompt onDone={() => setMfaDone(true)} />
      {mfaDone && <WhatsNewDialog />}
    </>
  );
}
