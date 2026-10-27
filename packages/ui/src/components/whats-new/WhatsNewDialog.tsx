import { useEffect, useRef, useState } from "react";
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

/** The newest release's highlights, once per browser. onDone fires once: when it decides not to show, or when it is closed. */
export default function WhatsNewDialog({ onDone }: { onDone?: () => void }) {
  const navigate = useNavigate();
  const [userId, setUserId] = useState("");
  const release = LATEST_RELEASE;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!release?.highlights) {
      onDoneRef.current?.();
      return;
    }
    let active = true;
    (async () => {
      let shown = false;
      try {
        const signIn = await currentSignIn();
        if (active && signIn && seenVersion(signIn.userId) !== release.version) {
          setUserId(signIn.userId);
          shown = true;
        }
      } catch (err) {
        console.error("Could not check What's new", err);
      }
      if (active && !shown) onDoneRef.current?.();
    })();
    return () => {
      active = false;
    };
  }, [release]);

  if (!userId || !release) return null;

  const close = () => {
    markSeen(userId, release.version);
    setUserId("");
    onDoneRef.current?.();
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
