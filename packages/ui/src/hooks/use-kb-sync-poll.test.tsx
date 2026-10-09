import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KBSyncClient } from "../common/api-client/kb-sync-client";
import { API, json, stubFetch } from "../test/fetch-routes";
import { testConfig } from "../test/render";
import { KB_SYNC_POLL_MS, useKbSyncPoll } from "./use-kb-sync-poll";

const STILL_SYNCING = "GET /kb-sync/still-syncing";

beforeEach(() => {
  vi.useFakeTimers();
});

const tick = () => act(() => vi.advanceTimersByTimeAsync(KB_SYNC_POLL_MS));

function setup(...replies: Response[]) {
  let i = 0;
  const net = stubFetch({ [STILL_SYNCING]: () => replies[Math.min(i++, replies.length - 1)].clone() });
  const client = new KBSyncClient(testConfig);
  const hook = renderHook(() => useKbSyncPoll(client));
  act(() => hook.result.current.start());
  return { net, ...hook };
}

describe("useKbSyncPoll", () => {
  it("shows indexing until the server reports DONE, then stops polling", async () => {
    const { result, net } = setup(json("STILL SYNCING"), json("DONE"));
    expect(result.current.status).toBe("indexing");

    await tick();
    expect(result.current.status).toBe("indexing");
    await tick();
    expect(result.current.status).toBe("idle");

    await tick();
    expect(net.to(STILL_SYNCING)).toHaveLength(2);
    expect(net.calls[0].url.href).toBe(`${API}/kb-sync/still-syncing`);
  });

  it("stops with 'unknown' on a 403 from an older server", async () => {
    const { result, net } = setup(json({ message: "Forbidden" }, 403));
    await tick();
    expect(result.current.status).toBe("unknown");
    await tick();
    expect(net.to(STILL_SYNCING)).toHaveLength(1);
  });

  it("keeps polling through a transient 5xx", async () => {
    const { result, net } = setup(json({ message: "busy" }, 503), json("DONE"));
    await tick();
    expect(result.current.status).toBe("indexing");
    await tick();
    expect(result.current.status).toBe("idle");
    expect(net.to(STILL_SYNCING)).toHaveLength(2);
  });

  it("stops polling on unmount", async () => {
    const { unmount, net } = setup(json("STILL SYNCING"));
    unmount();
    await tick();
    expect(net.to(STILL_SYNCING)).toHaveLength(0);
  });
});
