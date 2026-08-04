/**
 * Coverage for the rename rollback safety gate that prevents post-mutation claim deletion.
 * Run: node --test tests/nofo-rename-rollback.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canSafelyRollbackRenameClaim } from "../lib/chatbot-api/functions/landing-page/nofo-rename/rollback-safety.mjs";

describe("canSafelyRollbackRenameClaim", () => {
  it("allows rollback when a new row was claimed and the source is still intact", () => {
    assert.equal(canSafelyRollbackRenameClaim(true, false), true);
  });

  it("forbids rollback after source S3 mutation to avoid deleting the only remaining metadata row", () => {
    assert.equal(canSafelyRollbackRenameClaim(true, true), false);
  });

  it("forbids rollback when no new row was claimed", () => {
    assert.equal(canSafelyRollbackRenameClaim(false, false), false);
    assert.equal(canSafelyRollbackRenameClaim(false, true), false);
  });

  it("treats missing/undefined flags as non-rollback for the claim flag", () => {
    assert.equal(canSafelyRollbackRenameClaim(undefined, false), false);
    assert.equal(canSafelyRollbackRenameClaim(true, undefined), true);
  });
});
