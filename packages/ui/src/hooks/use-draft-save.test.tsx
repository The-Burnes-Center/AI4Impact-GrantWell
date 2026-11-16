import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDraftSave } from "./use-draft-save";
import { auth } from "../test/amplify";
import { json, stubFetch } from "../test/fetch-routes";
import { renderApp } from "../test/render";

const jwt = (secondsLeft: number) =>
  [
    "e30",
    btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsLeft }))
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_"),
    "sig",
  ].join(".");

const withToken = (token: string) =>
  auth.fetchAuthSession.mockResolvedValue({ tokens: { idToken: { payload: { sub: "user-1" }, toString: () => token } } });

let hook: ReturnType<typeof useDraftSave> | null = null;
function Harness(): null {
  hook = useDraftSave({ sessionId: "s1", documentIdentifier: "Grant A/", fallbackTitle: "Grant A", delay: 60_000 });
  return null;
}

const leaveTab = () => {
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
};

afterEach(() => {
  delete (document as { visibilityState?: unknown }).visibilityState;
  vi.useRealTimers();
  hook = null;
});

const render = () => renderApp(<Harness />);

describe("useDraftSave exit save", () => {
  it("sends the pending edit with the kept token when the tab is hidden", async () => {
    const token = jwt(600);
    withToken(token);
    const net = stubFetch({ "POST /user-draft": json({}) });
    render();
    await waitFor(() => expect(auth.fetchAuthSession).toHaveBeenCalled());

    act(() => {
      void hook!.saveFields({ title: "New title" });
    });
    act(() => leaveTab());

    expect(net.to("POST /user-draft")).toHaveLength(1);
    expect(net.last("POST /user-draft").headers.get("Authorization")).toBe(`Bearer ${token}`);
  });

  it("skips the network rather than send a token that has run out, so the session isn't ended", async () => {
    withToken(jwt(-5));
    const net = stubFetch({ "POST /user-draft": json({}) });
    render();
    await waitFor(() => expect(auth.fetchAuthSession).toHaveBeenCalled());

    act(() => {
      void hook!.saveFields({ title: "New title" });
    });
    act(() => leaveTab());

    expect(net.to("POST /user-draft")).toHaveLength(0);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("renews the kept token shortly before it runs out", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    withToken(jwt(120));
    stubFetch({});
    render();
    await waitFor(() => expect(auth.fetchAuthSession).toHaveBeenCalled());

    await act(() => vi.advanceTimersByTimeAsync(61_000));

    expect(auth.fetchAuthSession).toHaveBeenCalledWith({ forceRefresh: true });
  });
});
