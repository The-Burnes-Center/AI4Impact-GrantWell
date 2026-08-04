/**
 * Tests for the promote-copy suppression in the retrieve-nofos Lambda.
 *
 * A state's promote-copy fork hides its federal parent so users see one row instead of two.
 * That is only correct while the fork is itself on screen: a fork that is archived, still
 * processing or quarantined must not hide a live federal grant from the state.
 *
 * The handler is ESM with top-level AWS SDK imports, so rather than import it (which would need
 * SDK stubs and credentials) the pure helpers are evaluated out of the module source in a vm
 * sandbox. That keeps the assertions on the shipped code without any AWS calls.
 */

import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

const HANDLER_PATH = path.join(
  __dirname,
  "../lib/chatbot-api/functions/landing-page/retrieve-nofos/index.mjs"
);

type Nofo = {
  name: string;
  status?: string;
  processing_status?: string | null;
  scope?: string | null;
  state?: string | null;
  promoted_from?: string | null;
};

type CallerScope = { role: string; state: string };

type Helpers = {
  callerCanSeeNofo: (callerScope: CallerScope, nofo: Nofo) => boolean;
  supersededFederalNames: (callerScope: CallerScope, nofoData: Nofo[]) => Set<string>;
};

/**
 * Pull the helper declarations out of the handler source and evaluate just those. Everything
 * above `callerCanSeeNofo` is imports and env parsing; everything below `supersededFederalNames`
 * needs the AWS SDK.
 */
function loadHelpers(): Helpers {
  const source = fs.readFileSync(HANDLER_PATH, "utf8");
  const start = source.indexOf("function callerCanSeeNofo");
  const end = source.indexOf("// Convert a ReadableStream to a string");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Could not locate the visibility helpers in retrieve-nofos/index.mjs");
  }
  const context: Record<string, unknown> = {};
  vm.runInNewContext(
    `${source.slice(start, end)}\nthis.exported = { callerCanSeeNofo, supersededFederalNames };`,
    context
  );
  return (context as { exported: Helpers }).exported;
}

const { callerCanSeeNofo, supersededFederalNames } = loadHelpers();

const maUser: CallerScope = { role: "user", state: "MA" };

const federalParent: Nofo = {
  name: "Clean Water Infrastructure",
  status: "active",
  scope: "federal",
  state: null,
  promoted_from: null,
};

function fork(overrides: Partial<Nofo> = {}): Nofo {
  return {
    name: "Clean Water Infrastructure (Massachusetts)",
    status: "active",
    processing_status: null,
    scope: "state",
    state: "MA",
    promoted_from: "Clean Water Infrastructure",
    ...overrides,
  };
}

/** The `folders` list the handler returns: scope filter, then suppression, then active-only. */
function visibleNames(callerScope: CallerScope, nofoData: Nofo[]): string[] {
  const isPrivileged = callerScope.role === "developer" || callerScope.role === "regularAdmin";
  let rows = nofoData.filter((nofo) => isPrivileged || callerCanSeeNofo(callerScope, nofo));
  if (!isPrivileged) {
    const superseded = supersededFederalNames(callerScope, rows);
    rows = rows.filter(
      (nofo) => !((nofo.scope || "federal") === "federal" && superseded.has(nofo.name))
    );
  }
  return rows
    .filter((nofo) => nofo.status === "active" && !nofo.processing_status)
    .map((nofo) => nofo.name);
}

describe("retrieve-nofos promote-copy suppression", () => {
  it("hides the federal parent while the state's fork is live", () => {
    const rows = [federalParent, fork()];
    expect(visibleNames(maUser, rows)).toEqual(["Clean Water Infrastructure (Massachusetts)"]);
  });

  it("keeps the federal parent visible when the fork has been archived", () => {
    // A state deadline is usually earlier than the federal one, so auto-archive retires the fork
    // first. The federal grant is still open and must stay on the state's landing page.
    const rows = [federalParent, fork({ status: "archived" })];
    expect(visibleNames(maUser, rows)).toEqual(["Clean Water Infrastructure"]);
  });

  it("keeps the federal parent visible while the fork is reprocessing", () => {
    const rows = [
      federalParent,
      fork({ status: "processing", processing_status: "extracting_text" }),
    ];
    expect(visibleNames(maUser, rows)).toEqual(["Clean Water Infrastructure"]);
  });

  it("keeps the federal parent visible when the fork was quarantined", () => {
    const rows = [federalParent, fork({ status: "quarantined", processing_status: "quarantined" })];
    expect(visibleNames(maUser, rows)).toEqual(["Clean Water Infrastructure"]);
  });

  it("ignores another state's fork", () => {
    const rows = [
      federalParent,
      fork({ name: "Clean Water Infrastructure (Connecticut)", state: "CT" }),
    ];
    expect(visibleNames(maUser, rows)).toEqual(["Clean Water Infrastructure"]);
  });

  it("shows both rows to a platform admin", () => {
    const rows = [federalParent, fork()];
    expect(visibleNames({ role: "regularAdmin", state: "" }, rows)).toEqual([
      "Clean Water Infrastructure",
      "Clean Water Infrastructure (Massachusetts)",
    ]);
  });

  it("ignores rows with no promoted_from", () => {
    const rows = [federalParent, fork({ promoted_from: null })];
    expect(supersededFederalNames(maUser, rows).size).toBe(0);
  });

  it("supersedes nothing for a caller with no state", () => {
    const rows = [federalParent, fork()];
    expect(supersededFederalNames({ role: "user", state: "" }, rows).size).toBe(0);
  });
});
