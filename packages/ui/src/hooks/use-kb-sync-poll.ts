import { useCallback, useEffect, useRef, useState } from "react";
import { KbSyncStatusError } from "../common/api-client/kb-sync-client";

export type KbSyncStatus = "idle" | "indexing" | "unknown";

export const KB_SYNC_POLL_MS = 5000;

export const KB_SYNC_UNKNOWN_MESSAGE =
  "Your documents are uploaded. We couldn't check on indexing, so they may take a few minutes to appear.";

/**
 * After an upload, polls the knowledge-base sync until it reports DONE. Older servers answer
 * 403 to non-admins; that stops polling as "unknown" instead of leaving the banner up forever.
 * Other failures count as transient and polling continues.
 */
export function useKbSyncPoll(client: { isSyncing(): Promise<string> }) {
  const [status, setStatus] = useState<KbSyncStatus>("idle");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clientRef = useRef(client);
  clientRef.current = client;

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const start = useCallback(() => {
    stop();
    setStatus("indexing");
    timer.current = setInterval(async () => {
      try {
        const result = await clientRef.current.isSyncing();
        if (typeof result === "string" && result.includes("DONE")) {
          stop();
          setStatus("idle");
        }
      } catch (error) {
        if (error instanceof KbSyncStatusError && error.status === 403) {
          stop();
          setStatus("unknown");
        }
      }
    }, KB_SYNC_POLL_MS);
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { status, start };
}

export default useKbSyncPoll;
