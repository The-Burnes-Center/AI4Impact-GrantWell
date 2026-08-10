import {
  applyRemoteSections,
  mergeSectionMaps,
  remoteOwnedSections,
} from "../lib/user-interface/app/src/common/helpers/draft-merge";

/**
 * Two tabs are open on the same draft, both baselined at rev 5.
 *
 * Tab 2 rewrites "Statement of Need" and saves, taking the row to rev 6.
 * Tab 1 then edits "Project Summary"; its conditional write is rejected with a
 * 409 and it has to fold the winner's section back into the whole-map payload it
 * sends. The section Tab 1 never touched must not travel back to its rev-5 text.
 */
const SERVER_AT_REV_5 = {
  "Project Summary": "summary as of rev 5",
  "Statement of Need": "need, as tab 1 last saw it at rev 5",
};

const REMOTE_AT_REV_6 = {
  "Project Summary": "summary as of rev 5",
  "Statement of Need": "need, rewritten by tab 2",
};

const TAB_1_STALE_MAP = {
  "Project Summary": "summary, just edited in tab 1",
  "Statement of Need": "need, as tab 1 last saw it at rev 5",
};

const TAB_1_DIRTY = ["Project Summary"];

describe("mergeSectionMaps", () => {
  it("keeps the sections this client changed and takes the server's for the rest", () => {
    expect(mergeSectionMaps(REMOTE_AT_REV_6, TAB_1_STALE_MAP, TAB_1_DIRTY)).toEqual({
      "Project Summary": "summary, just edited in tab 1",
      "Statement of Need": "need, rewritten by tab 2",
    });
  });

  it("adds a section the server has never seen", () => {
    const merged = mergeSectionMaps(REMOTE_AT_REV_6, { "Evaluation Plan": "brand new" }, [
      "Evaluation Plan",
    ]);
    expect(merged["Evaluation Plan"]).toBe("brand new");
    expect(merged["Statement of Need"]).toBe("need, rewritten by tab 2");
  });

  it("tolerates a missing map on either side", () => {
    expect(mergeSectionMaps(undefined, undefined, ["Project Summary"])).toEqual({});
    expect(mergeSectionMaps(undefined, TAB_1_STALE_MAP, TAB_1_DIRTY)).toEqual({
      "Project Summary": "summary, just edited in tab 1",
    });
  });
});

describe("remoteOwnedSections", () => {
  it("claims a section the other writer changed under us", () => {
    expect(remoteOwnedSections(REMOTE_AT_REV_6, SERVER_AT_REV_5, TAB_1_DIRTY)).toEqual({
      "Statement of Need": "need, rewritten by tab 2",
    });
  });

  it("never claims a section this client is editing", () => {
    const dirty = ["Project Summary", "Statement of Need"];
    expect(remoteOwnedSections(REMOTE_AT_REV_6, SERVER_AT_REV_5, dirty)).toEqual({});
  });

  it("leaves alone a section the other writer did not touch", () => {
    // The conflict came from a different field, so an unflushed local edit to
    // "Statement of Need" is still this client's to keep.
    expect(remoteOwnedSections(SERVER_AT_REV_5, SERVER_AT_REV_5, TAB_1_DIRTY)).toEqual({});
  });

  it("claims everything when there is no known server state to compare against", () => {
    expect(remoteOwnedSections(REMOTE_AT_REV_6, undefined, TAB_1_DIRTY)).toEqual({
      "Statement of Need": "need, rewritten by tab 2",
    });
  });
});

describe("applyRemoteSections", () => {
  const remoteOwned = remoteOwnedSections(REMOTE_AT_REV_6, SERVER_AT_REV_5, TAB_1_DIRTY);

  it("overrides the superseded copy in the conflict retry payload", () => {
    expect(applyRemoteSections(TAB_1_STALE_MAP, remoteOwned, TAB_1_DIRTY)).toEqual({
      "Project Summary": "summary, just edited in tab 1",
      "Statement of Need": "need, rewritten by tab 2",
    });
  });

  it("keeps overriding on later writes, which no longer conflict", () => {
    // Tab 1 types in "Project Summary" again. The write now carries a matching
    // rev, so there is no 409 and no second merge to lean on.
    const nextWrite = {
      ...TAB_1_STALE_MAP,
      "Project Summary": "summary, edited again in tab 1",
    };
    expect(applyRemoteSections(nextWrite, remoteOwned, TAB_1_DIRTY)["Statement of Need"]).toBe(
      "need, rewritten by tab 2"
    );
  });

  it("yields to this client once it edits that section itself", () => {
    const dirty = ["Project Summary", "Statement of Need"];
    const nextWrite = {
      ...TAB_1_STALE_MAP,
      "Statement of Need": "need, now deliberately rewritten in tab 1",
    };
    expect(applyRemoteSections(nextWrite, remoteOwned, dirty)["Statement of Need"]).toBe(
      "need, now deliberately rewritten in tab 1"
    );
  });

  it("passes the client's map through untouched when no conflict has been seen", () => {
    // Guards the local-cache restore path: sections recovered from localStorage
    // are never marked dirty, and the client's map stays authoritative for them.
    const cacheRestored = { ...TAB_1_STALE_MAP, "Evaluation Plan": "recovered from localStorage" };
    expect(applyRemoteSections(cacheRestored, {}, [])).toBe(cacheRestored);
  });
});
