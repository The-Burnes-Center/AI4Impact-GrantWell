import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoSave } from "./use-auto-save";

beforeEach(() => {
  vi.useFakeTimers();
});

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("useAutoSave", () => {
  it("debounces edits into one save of the latest data, then shows saved and returns to idle", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave({ delay: 1000, savedDisplayDuration: 2000 }));

    act(() => result.current.triggerSave({ text: "a" }, save));
    act(() => result.current.triggerSave({ text: "ab" }, save));
    expect(result.current.saveStatus).toBe("pending");
    expect(result.current.isDirty).toBe(true);

    await advance(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ text: "ab" });
    expect(result.current.saveStatus).toBe("saved");

    await advance(2000);
    expect(result.current.saveStatus).toBe("idle");
  });

  it("skips a save identical to the last one that succeeded", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave({ delay: 10 }));
    act(() => result.current.triggerSave({ text: "same" }, save));
    await advance(10);
    act(() => result.current.triggerSave({ text: "same" }, save));
    await advance(10);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("retries after 1 s, 4 s and 10 s, then reports the error instead of saved", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Network down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useAutoSave({ delay: 100 }));

    act(() => result.current.triggerSave({ text: "x" }, save));
    await advance(100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.saveStatus).toBe("pending");

    await advance(1000);
    expect(save).toHaveBeenCalledTimes(2);
    await advance(4000);
    expect(save).toHaveBeenCalledTimes(3);
    await advance(10000);
    expect(save).toHaveBeenCalledTimes(4);
    expect(result.current.saveStatus).toBe("error");
    expect(result.current.error).toBe("Network down");
    expect(result.current.isDirty).toBe(true);
  });

  it("hands unsaved work to onExitFlush when the editor unmounts", () => {
    const onExitFlush = vi.fn();
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useAutoSave({ delay: 1000, onExitFlush }));
    act(() => result.current.triggerSave({ text: "unsent" }, save));
    unmount();
    expect(onExitFlush).toHaveBeenCalledWith({ text: "unsent" });
    expect(save).not.toHaveBeenCalled();
  });

  it("flush sends the pending save at once", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave({ delay: 60_000 }));
    act(() => result.current.triggerSave({ text: "now" }, save));
    await act(() => result.current.flush());
    expect(save).toHaveBeenCalledWith({ text: "now" });
  });
});
