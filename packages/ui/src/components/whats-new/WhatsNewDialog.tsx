import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import Modal from "../common/Modal";
import Button from "../ui/Button";
import { LATEST_RELEASE } from "../../common/release-notes";
import { currentSignIn } from "../../common/sign-in-dialog";
import { notesMarkdown } from "./notes-markdown";
import "./whats-new.css";

const SEEN_PREFIX = "gw.whatsNewSeen.";

function seenVersion(userId: string): string | null {
  try {
    return window.localStorage.getItem(SEEN_PREFIX + userId);
  } catch {
    return null;
  }
}

function markSeen(userId: string, version: string): void {
  try {
    window.localStorage.setItem(SEEN_PREFIX + userId, version);
  } catch {
    // Storage disabled: the dialog shows again on the next sign-in.
  }
}

/** The newest release's highlights, once per browser. */
export default function WhatsNewDialog() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState("");
  const release = LATEST_RELEASE;

  useEffect(() => {
    if (!release?.highlights) return;
    let active = true;
    (async () => {
      try {
        const signIn = await currentSignIn();
        if (!active || !signIn) return;
        if (seenVersion(signIn.userId) === release.version) return;
        setUserId(signIn.userId);
      } catch (err) {
        console.error("Could not check What's new", err);
      }
    })();
    return () => {
      active = false;
    };
  }, [release]);

  if (!userId || !release) return null;

  const close = () => {
    markSeen(userId, release.version);
    setUserId("");
  };

  return (
    <Modal isOpen onClose={close} title="What's new in GrantWell" maxWidth="520px">
      <div className="whats-new-dialog__body">{notesMarkdown(release.highlights)}</div>
      <div className="whats-new-dialog__actions">
        <Button type="button" onClick={close}>
          Got it
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            close();
            navigate("/whats-new");
          }}
        >
          See everything new
        </Button>
      </div>
    </Modal>
  );
}
