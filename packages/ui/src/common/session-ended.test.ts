import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("aws-amplify/auth", () => ({ signOut }));

const store = new Map<string, string>();
const assign = vi.fn();
vi.stubGlobal("sessionStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string): void => void store.set(k, v),
  removeItem: (k: string): void => void store.delete(k),
});
vi.stubGlobal("window", { location: { assign } });

const respondWith = (status: number) => vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status })));
const authed = { headers: { Authorization: "Bearer t" } };

let mod: typeof import("./session-ended");
beforeEach(async () => {
  vi.resetModules();
  signOut.mockClear();
  assign.mockClear();
  store.clear();
  mod = await import("./session-ended");
  mod.setSignedIn(true);
});

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("apiFetch", () => {
  it("signs out and goes to sign-in with a notice on a 401 to an authenticated call", async () => {
    respondWith(401);
    const res = await mod.apiFetch("/x", authed);
    await settle();
    expect(res.status).toBe(401);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/login");
    expect(mod.hasSessionEndedNotice()).toBe(true);
  });

  it("leaves 403 alone: it means wrong state or not an admin", async () => {
    respondWith(403);
    await mod.apiFetch("/x", authed);
    await settle();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("ignores a 401 from a request without a token, such as a presigned upload", async () => {
    respondWith(401);
    await mod.apiFetch("https://bucket.s3.amazonaws.com/x", { method: "PUT" });
    await settle();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("ends the session once when several calls fail together", async () => {
    respondWith(401);
    await Promise.all([mod.apiFetch("/a", authed), mod.apiFetch("/b", authed), mod.apiFetch("/c", authed)]);
    await settle();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("does nothing on public pages, where nobody is signed in", async () => {
    mod.setSignedIn(false);
    await mod.endSession();
    expect(signOut).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("notice", () => {
  it("clears on the next sign-in", async () => {
    respondWith(401);
    await mod.apiFetch("/x", authed);
    await settle();
    mod.setSignedIn(true);
    expect(mod.hasSessionEndedNotice()).toBe(false);
  });
});
