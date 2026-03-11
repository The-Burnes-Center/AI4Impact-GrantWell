import { useCallback, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved";

interface UseAutoSaveOptions {
  /** Debounce delay in ms before the save fires (default 1000) */
  delay?: number;
  /** How long to show the "saved" status before reverting to idle (default 2000) */
  savedDisplayDuration?: number;
}

/**
 * Debounced auto-save hook.
 *
 * Returns a `triggerSave` function that accepts data, debounces, calls
 * the provided `saveFn`, and manages the `saveStatus` state.
 *
 * Usage:
 * ```ts
 * const { triggerSave, saveStatus } = useAutoSave({
 *   delay: 1000,
 * });
 *
 * const handleChange = (value: string) => {
 *   setFormData(value);
 *   triggerSave(value, async (data) => {
 *     localStorage.setItem("myKey", JSON.stringify(data));
 *     await apiSave(data);
 *   });
 * };
 * ```
 */
export function useAutoSave({
  delay = 1000,
  savedDisplayDuration = 2000,
}: UseAutoSaveOptions = {}) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedDisplayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Cancel any pending save (e.g., on unmount) */
  const cancel = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    if (savedDisplayRef.current) {
      clearTimeout(savedDisplayRef.current);
      savedDisplayRef.current = null;
    }
  }, []);

  /**
   * Trigger a debounced save.
   * @param data - the data to save
   * @param saveFn - async function that persists the data
   */
  const triggerSave = useCallback(
    <T>(data: T, saveFn: (data: T) => Promise<void>) => {
      // Clear existing timers
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      setSaveStatus("saving");

      autoSaveTimeoutRef.current = setTimeout(async () => {
        try {
          await saveFn(data);
          setSaveStatus("saved");

          if (savedDisplayRef.current) {
            clearTimeout(savedDisplayRef.current);
          }
          savedDisplayRef.current = setTimeout(() => {
            setSaveStatus("idle");
          }, savedDisplayDuration);
        } catch (error) {
          console.error("Auto-save failed:", error);
          setSaveStatus("idle");
        }
      }, delay);
    },
    [delay, savedDisplayDuration]
  );

  return { triggerSave, saveStatus, cancel };
}

export default useAutoSave;
