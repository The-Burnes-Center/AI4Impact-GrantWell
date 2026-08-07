import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/** Backoff between save attempts; length also caps the number of retries. */
const RETRY_DELAYS_MS = [1000, 4000, 10000];

interface UseAutoSaveOptions {
  /** Debounce delay in ms before the save fires (default 1000) */
  delay?: number;
  /** How long to show the "saved" status before reverting to idle (default 2000) */
  savedDisplayDuration?: number;
  /**
   * Persist pending work when the page is closed, hidden or the component
   * unmounts. Runs on a path that cannot await, so it must be synchronous or
   * fire-and-forget.
   */
  onExitFlush?: (data: unknown) => void;
}

interface PendingSave {
  data: unknown;
  saveFn: (data: unknown) => Promise<void>;
  serialized: string;
}

/**
 * Debounced auto-save with a status machine that distinguishes `pending`
 * ("edited, not yet sent") from `saving`, and surfaces `error` instead of
 * reporting a save that failed as saved.
 *
 * Usage:
 * ```ts
 * const { triggerSave, saveStatus, flush } = useAutoSave({ delay: 1000 });
 *
 * const handleChange = (value: string) => {
 *   setFormData(value);
 *   triggerSave(value, async (data) => { await apiSave(data); });
 * };
 * ```
 */
export function useAutoSave({
  delay = 1000,
  savedDisplayDuration = 2000,
  onExitFlush,
}: UseAutoSaveOptions = {}) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingRef = useRef<PendingSave | null>(null);
  const lastSavedSerializedRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedDisplayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const exitFlushRef = useRef(onExitFlush);
  exitFlushRef.current = onExitFlush;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const publishStatus = useCallback((status: SaveStatus) => {
    if (mountedRef.current) setSaveStatus(status);
  }, []);

  const clearTimer = (ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
    if (ref.current) {
      clearTimeout(ref.current);
      ref.current = null;
    }
  };

  const runSave = useCallback(
    async (attempt = 0): Promise<void> => {
      const pending = pendingRef.current;
      if (!pending || inFlightRef.current) return;

      clearTimer(savedDisplayRef);
      inFlightRef.current = true;
      publishStatus("saving");

      try {
        await pending.saveFn(pending.data);
        inFlightRef.current = false;
        lastSavedSerializedRef.current = pending.serialized;
        setError(null);
        setLastSavedAt(new Date().toISOString());

        if (pendingRef.current && pendingRef.current.serialized === pending.serialized) {
          pendingRef.current = null;
        }
        if (pendingRef.current) {
          publishStatus("pending");
          clearTimer(debounceRef);
          debounceRef.current = setTimeout(() => void runSave(0), delay);
          return;
        }

        publishStatus("saved");
        savedDisplayRef.current = setTimeout(() => publishStatus("idle"), savedDisplayDuration);
      } catch (err) {
        inFlightRef.current = false;
        if (attempt < RETRY_DELAYS_MS.length) {
          publishStatus("pending");
          clearTimer(retryRef);
          retryRef.current = setTimeout(() => void runSave(attempt + 1), RETRY_DELAYS_MS[attempt]);
          return;
        }
        console.error("Auto-save failed:", err);
        setError(err instanceof Error ? err.message : "Save failed");
        publishStatus("error");
      }
    },
    [delay, savedDisplayDuration, publishStatus]
  );

  /** No-ops when the payload matches the last successful save. */
  const triggerSave = useCallback(
    <T>(data: T, saveFn: (data: T) => Promise<void>) => {
      const serialized = JSON.stringify(data);
      if (serialized === lastSavedSerializedRef.current && !pendingRef.current) return;

      pendingRef.current = {
        data,
        saveFn: saveFn as (data: unknown) => Promise<void>,
        serialized,
      };

      clearTimer(retryRef);
      clearTimer(savedDisplayRef);
      clearTimer(debounceRef);
      publishStatus("pending");
      debounceRef.current = setTimeout(() => void runSave(0), delay);
    },
    [delay, runSave, publishStatus]
  );

  /** Send any pending save immediately. Resolves once it settles. */
  const flush = useCallback(async () => {
    clearTimer(debounceRef);
    clearTimer(retryRef);
    if (!pendingRef.current) return;
    await runSave(0);
  }, [runSave]);

  /** Retry after a terminal failure. */
  const retry = useCallback(async () => {
    if (!pendingRef.current) return;
    setError(null);
    await runSave(0);
  }, [runSave]);

  /** Drop any pending save without persisting it. */
  const cancel = useCallback(() => {
    clearTimer(debounceRef);
    clearTimer(retryRef);
    clearTimer(savedDisplayRef);
    pendingRef.current = null;
  }, []);

  // visibilitychange is the only exit signal iOS Safari reliably fires.
  useEffect(() => {
    if (!onExitFlush) return;

    const flushOnExit = () => {
      const pending = pendingRef.current;
      if (!pending) return;
      clearTimer(debounceRef);
      clearTimer(retryRef);
      exitFlushRef.current?.(pending.data);
      pendingRef.current = null;
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flushOnExit();
    };

    window.addEventListener("beforeunload", flushOnExit);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("beforeunload", flushOnExit);
      document.removeEventListener("visibilitychange", handleVisibility);
      flushOnExit();
    };
    // exitFlushRef keeps the callback current; depending on it would re-flush
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!onExitFlush]);

  useEffect(() => cancel, [cancel]);

  return {
    triggerSave,
    saveStatus,
    flush,
    retry,
    cancel,
    error,
    lastSavedAt,
    isDirty: saveStatus === "pending" || saveStatus === "saving" || saveStatus === "error",
  };
}

export default useAutoSave;
