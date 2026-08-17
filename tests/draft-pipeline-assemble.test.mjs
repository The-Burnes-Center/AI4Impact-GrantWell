/**
 * Regression tests for the draft-generation Assemble step.
 *
 * Run with: node --test tests/
 *
 * Assemble reads the generated prose back out of DynamoDB and then overwrites
 * the very attribute it read, so both of its reads have to be strongly
 * consistent. The fake client below models replica lag directly — it keeps a
 * `committed` and a `stale` copy of each row and serves `stale` to any read that
 * omits ConsistentRead — which is what makes these tests catch the regression
 * rather than just describe it.
 *
 * The real Lambda is loaded unmodified. It is copied into a temp directory that
 * carries stub `node_modules/@aws-sdk/*` packages, so nothing has to be
 * installed to run this.
 */

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSEMBLE_SRC = path.resolve(
  HERE,
  "../lib/chatbot-api/functions/draft-pipeline/assemble/index.mjs"
);

const JOBS_TABLE = "draft-generation-jobs";
const DRAFT_TABLE = "drafts";

const CLIENT_STUB = `
export class GetItemCommand {
  constructor(input) { this.input = input; this.commandName = "GetItemCommand"; }
}
export class UpdateItemCommand {
  constructor(input) { this.input = input; this.commandName = "UpdateItemCommand"; }
}
export class DynamoDBClient {
  constructor(config) { this.config = config; }
  async send(command) {
    if (typeof globalThis.__ddbSend !== "function") {
      throw new Error("test hook globalThis.__ddbSend is not installed");
    }
    return globalThis.__ddbSend(command);
  }
}
`;

// marshall/unmarshall are identity here so the fake rows can stay plain objects;
// assemble only round-trips values through them.
const UTIL_STUB = `
export const marshall = (value) => value;
export const unmarshall = (value) => value;
`;

async function stubPackage(root, name, source) {
  const dir = path.join(root, "node_modules", "@aws-sdk", name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: `@aws-sdk/${name}`,
      version: "0.0.0-test",
      type: "module",
      exports: "./index.mjs",
    })
  );
  await writeFile(path.join(dir, "index.mjs"), source);
}

let handler;

before(async () => {
  const sandbox = await mkdtemp(path.join(tmpdir(), "assemble-test-"));
  await stubPackage(sandbox, "client-dynamodb", CLIENT_STUB);
  await stubPackage(sandbox, "util-dynamodb", UTIL_STUB);

  const target = path.join(sandbox, "index.mjs");
  await copyFile(ASSEMBLE_SRC, target);

  ({ handler } = await import(pathToFileURL(target).href));
});

beforeEach(() => {
  process.env.DRAFT_GENERATION_JOBS_TABLE_NAME = JOBS_TABLE;
  process.env.DRAFT_TABLE_NAME = DRAFT_TABLE;
  delete globalThis.__ddbSend;
});

/**
 * @param rows.jobCommitted   job row as every prior write left it
 * @param rows.jobStale       job row as a lagging replica would answer
 * @param rows.draftCommitted draft row as every prior write left it
 * @param rows.draftStale     draft row as a lagging replica would answer
 */
function installFakeDynamo(rows) {
  const reads = [];
  const writes = [];

  const pick = (table, consistent) => {
    if (table === JOBS_TABLE) return consistent ? rows.jobCommitted : rows.jobStale;
    if (table === DRAFT_TABLE) return consistent ? rows.draftCommitted : rows.draftStale;
    throw new Error(`unexpected table in test: ${table}`);
  };

  globalThis.__ddbSend = async (command) => {
    const { input } = command;

    if (command.commandName === "GetItemCommand") {
      reads.push(command);
      const row = pick(input.TableName, input.ConsistentRead === true);
      return row ? { Item: row } : {};
    }

    if (command.commandName === "UpdateItemCommand") {
      writes.push(command);
      return {};
    }

    throw new Error(`unexpected command in test: ${command.commandName}`);
  };

  return {
    readFor: (table) => reads.find((c) => c.input.TableName === table),
    writeFor: (table) => {
      const command = writes.find((c) => c.input.TableName === table);
      return command ? attributesWritten(command.input) : null;
    },
  };
}

/** Undo assemble's `#nameN = :valN` expression building back into a plain object. */
function attributesWritten(input) {
  const out = {};
  for (const [placeholder, attribute] of Object.entries(input.ExpressionAttributeNames)) {
    if (!placeholder.startsWith("#name")) continue;
    out[attribute] = input.ExpressionAttributeValues[`:val${placeholder.slice(5)}`];
  }
  return out;
}

const completed = (names) => names.map((name) => ({ sectionName: name, status: "completed" }));
const prose = (names) => Object.fromEntries(names.map((name) => [name, `prose for ${name}`]));

const SIX = ["Need", "Goals", "Approach", "Capacity", "Evaluation", "Budget"];

test("a lagging read of the job row does not discard prose that was written", async () => {
  // Every section was persisted by generate-section, but the replica assemble
  // happens to read has only caught up on the first Map wave.
  const dynamo = installFakeDynamo({
    jobCommitted: { sections: prose(SIX) },
    jobStale: { sections: prose(SIX.slice(0, 3)) },
    draftCommitted: { sections: {} },
    draftStale: { sections: {} },
  });

  const result = await handler({
    jobId: "job-1",
    sessionId: "session-1",
    userId: "user-1",
    totalSections: SIX.length,
    sectionResults: completed(SIX),
  });

  const job = dynamo.writeFor(JOBS_TABLE);
  assert.deepEqual(Object.keys(job.sections).sort(), [...SIX].sort());
  assert.equal(job.status, "completed");
  assert.equal(job.failedSections, undefined);
  assert.equal(result.sectionsGenerated, SIX.length);
  assert.equal(result.sectionsFailed, 0);

  // The draft has to end up with the same six, or the editor shows blanks.
  const draft = dynamo.writeFor(DRAFT_TABLE);
  assert.deepEqual(Object.keys(draft.sections).sort(), [...SIX].sort());
  assert.equal(draft.status, "editing_sections");
});

test("a job row read that has not caught up at all does not fail the whole job", async () => {
  const dynamo = installFakeDynamo({
    jobCommitted: { sections: prose(SIX) },
    jobStale: { sections: {} },
    draftCommitted: { sections: {} },
    draftStale: { sections: {} },
  });

  const result = await handler({
    jobId: "job-2",
    sessionId: "session-2",
    userId: "user-2",
    totalSections: SIX.length,
    sectionResults: completed(SIX),
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(Object.keys(dynamo.writeFor(JOBS_TABLE).sections).sort(), [...SIX].sort());

  // status "error" would send the draft back to the questionnaire step, losing
  // the user's place as well as the narrative.
  const draft = dynamo.writeFor(DRAFT_TABLE);
  assert.equal(draft.status, "editing_sections");
  assert.deepEqual(Object.keys(draft.sections).sort(), [...SIX].sort());
});

test("a lagging read of the draft row does not revert the user's newest edit", async () => {
  const dynamo = installFakeDynamo({
    jobCommitted: { sections: prose(["Budget"]) },
    jobStale: { sections: prose(["Budget"]) },
    draftCommitted: { sections: { Need: "the text the user just typed" } },
    draftStale: { sections: { Need: "an older autosave" } },
  });

  await handler({
    jobId: "job-3",
    sessionId: "session-3",
    userId: "user-3",
    totalSections: 1,
    sectionResults: completed(["Budget"]),
  });

  const draft = dynamo.writeFor(DRAFT_TABLE);
  assert.equal(draft.sections.Need, "the text the user just typed");
  assert.equal(draft.sections.Budget, "prose for Budget");
});

test("a draft row read that misses the row entirely does not drop prior sections", async () => {
  const dynamo = installFakeDynamo({
    jobCommitted: { sections: prose(["Budget"]) },
    jobStale: { sections: prose(["Budget"]) },
    draftCommitted: { sections: { Need: "written earlier by hand" } },
    draftStale: null,
  });

  await handler({
    jobId: "job-4",
    sessionId: "session-4",
    userId: "user-4",
    totalSections: 1,
    sectionResults: completed(["Budget"]),
  });

  assert.equal(dynamo.writeFor(DRAFT_TABLE).sections.Need, "written earlier by hand");
});

test("both reads that precede an overwrite ask for a strongly consistent read", async () => {
  const dynamo = installFakeDynamo({
    jobCommitted: { sections: prose(["Budget"]) },
    jobStale: { sections: prose(["Budget"]) },
    draftCommitted: { sections: {} },
    draftStale: { sections: {} },
  });

  await handler({
    jobId: "job-5",
    sessionId: "session-5",
    userId: "user-5",
    totalSections: 1,
    sectionResults: completed(["Budget"]),
  });

  assert.equal(dynamo.readFor(JOBS_TABLE).input.ConsistentRead, true);
  assert.equal(dynamo.readFor(DRAFT_TABLE).input.ConsistentRead, true);
});

test("a section that really failed is still reported as failed", async () => {
  const dynamo = installFakeDynamo({
    jobCommitted: { sections: prose(["Need"]) },
    jobStale: { sections: prose(["Need"]) },
    draftCommitted: { sections: {} },
    draftStale: { sections: {} },
  });

  const result = await handler({
    jobId: "job-6",
    sessionId: "session-6",
    userId: "user-6",
    totalSections: 2,
    sectionResults: [
      { sectionName: "Need", status: "completed" },
      { sectionName: "Approach", status: "error" },
    ],
  });

  const job = dynamo.writeFor(JOBS_TABLE);
  assert.equal(result.status, "partial");
  assert.deepEqual(job.failedSections, ["Approach"]);
  assert.deepEqual(Object.keys(job.sections), ["Need"]);
});
