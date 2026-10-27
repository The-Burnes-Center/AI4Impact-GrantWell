import { useState } from "react";
import { MFA_ENABLED } from "../common/instance";
import MfaPrompt from "./auth/MfaPrompt";
import WhatsNewDialog from "./whats-new/WhatsNewDialog";
import OutcomeReminder from "./outcomes/OutcomeReminder";

/** One dialog at a time: the MFA prompt first, then What's new, then the application-outcome reminder. */
export default function SignInNotices() {
  const [mfaDone, setMfaDone] = useState(!MFA_ENABLED);
  const [whatsNewDone, setWhatsNewDone] = useState(false);
  return (
    <>
      {MFA_ENABLED && <MfaPrompt onDone={() => setMfaDone(true)} />}
      {mfaDone && <WhatsNewDialog onDone={() => setWhatsNewDone(true)} />}
      {whatsNewDone && <OutcomeReminder />}
    </>
  );
}
