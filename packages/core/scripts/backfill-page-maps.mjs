#!/usr/bin/env node
/**
 * Writes `<grant>/raw-text-pages.json` for grants processed before extract-text saved page maps, so
 * chat citations can show page numbers. Each PDF grant goes through Textract again; the map is saved
 * only when the new text matches the stored raw-text.txt exactly, because citation offsets index into
 * that file. raw-text.txt itself is never changed. Textract bills per page (about $1.50 per 1,000).
 *
 * Bucket names come from the app stack:
 *   aws cloudformation list-stack-resources --stack-name <stack> --query "StackResourceSummaries[?
 *     starts_with(LogicalResourceId,'ChatbotAPIffioNofosDownloadBucket') || starts_with(LogicalResourceId,
 *     'ChatbotAPIGrantArtifactsBucket')]"
 *
 * Dry run (default; reads only, lists what would be processed):
 *   node scripts/backfill-page-maps.mjs --grant-bucket <name> --artifacts-bucket <name>
 * Apply:
 *   node scripts/backfill-page-maps.mjs --grant-bucket <name> --artifacts-bucket <name> --apply [--concurrency 4] [--grant <name>]
 */

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { TextractClient, StartDocumentTextDetectionCommand, GetDocumentTextDetectionCommand } from "@aws-sdk/client-textract";
import { joinLines, pageMap, pageMapKey } from "../lib/chatbot-api/functions/nofo-pipeline/extract-text/page-map.mjs";

const PDF_SUFFIX = "/NOFO-File-PDF";
const POLL_MS = 5000;
const MAX_WAIT_MS = 20 * 60 * 1000;
// Only for the dry-run cost estimate; real billing counts Textract pages.
const CHARS_PER_PAGE_ESTIMATE = 2500;

function parseArgs(argv) {
  const args = { apply: false, concurrency: 4, region: process.env.AWS_REGION || "us-east-1", force: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--grant-bucket") args.grantBucket = argv[++i];
    else if (arg === "--artifacts-bucket") args.artifactsBucket = argv[++i];
    else if (arg === "--grant") args.grant = argv[++i];
    else if (arg === "--concurrency") args.concurrency = Number(argv[++i]);
    else if (arg === "--region") args.region = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  if (!args.grantBucket || !args.artifactsBucket) {
    console.error("--grant-bucket and --artifacts-bucket are required");
    process.exit(1);
  }
  if (!(args.concurrency >= 1 && args.concurrency <= 10)) {
    console.error("--concurrency must be 1-10");
    process.exit(1);
  }
  return args;
}

async function listKeys(s3, bucket, suffixFilter) {
  const keys = [];
  let continuationToken;
  do {
    const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }));
    for (const object of listed.Contents || []) if (suffixFilter(object.Key)) keys.push(object.Key);
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function readText(s3, bucket, key) {
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return (await result.Body?.transformToString()) ?? "";
  } catch (error) {
    if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

/** The join of `lines` that gives `stored`: grants extracted before tables were written row by row have the plain join. */
export function matchingJoin(stored, lines) {
  return [joinLines(lines), joinLines(lines, { tables: false })].find((joined) => joined.text === stored) ?? null;
}

/** Grants with a PDF and a stored raw-text.txt that have no page map yet (all of them with `force`). */
export function planBackfill(grantKeys, artifactKeys, { force = false, only } = {}) {
  const artifacts = new Set(artifactKeys);
  const legacyText = new Set(grantKeys.filter((k) => k.endsWith("/raw-text.txt")));
  return grantKeys
    .filter((k) => k.endsWith(PDF_SUFFIX))
    .map((k) => k.slice(0, -PDF_SUFFIX.length))
    .filter((name) => !name.includes("/") && (!only || name === only))
    .filter((name) => artifacts.has(`${name}/raw-text.txt`) || legacyText.has(`${name}/raw-text.txt`))
    .filter((name) => force || !artifacts.has(pageMapKey(name)));
}

async function textractLines(textract, bucket, key) {
  const { JobId } = await textract.send(
    new StartDocumentTextDetectionCommand({ DocumentLocation: { S3Object: { Bucket: bucket, Name: key } } })
  );
  const deadline = Date.now() + MAX_WAIT_MS;
  let status = "IN_PROGRESS";
  while (status === "IN_PROGRESS") {
    if (Date.now() > deadline) throw new Error(`Textract job ${JobId} did not finish in ${MAX_WAIT_MS / 60000} minutes`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    status = (await textract.send(new GetDocumentTextDetectionCommand({ JobId }))).JobStatus;
  }
  if (status !== "SUCCEEDED") throw new Error(`Textract job ${JobId} ended ${status}`);
  const lines = [];
  let pages = 0;
  let nextToken;
  do {
    const result = await textract.send(new GetDocumentTextDetectionCommand({ JobId, NextToken: nextToken }));
    pages = Math.max(pages, result.DocumentMetadata?.Pages ?? 0);
    for (const block of result.Blocks || []) if (block.BlockType === "LINE") lines.push(block);
    nextToken = result.NextToken;
  } while (nextToken);
  return { lines, pages };
}

async function inPool(items, size, work) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await work(items[next++]);
    })
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const s3 = new S3Client({ region: args.region });
  const textract = new TextractClient({ region: args.region });

  const [grantKeys, artifactKeys] = await Promise.all([
    listKeys(s3, args.grantBucket, (k) => k.endsWith(PDF_SUFFIX) || k.endsWith("/raw-text.txt")),
    listKeys(s3, args.artifactsBucket, (k) => k.endsWith("/raw-text.txt") || k.endsWith("/raw-text-pages.json")),
  ]);
  const grants = planBackfill(grantKeys, artifactKeys, { force: args.force, only: args.grant });
  const artifacts = new Set(artifactKeys);
  const storedText = (name) =>
    artifacts.has(`${name}/raw-text.txt`)
      ? readText(s3, args.artifactsBucket, `${name}/raw-text.txt`)
      : readText(s3, args.grantBucket, `${name}/raw-text.txt`);

  if (!args.apply) {
    let chars = 0;
    await inPool(grants, 8, async (name) => {
      chars += (await storedText(name))?.length ?? 0;
    });
    const pages = Math.round(chars / CHARS_PER_PAGE_ESTIMATE);
    console.log(`${grants.length} PDF grants need a page map (about ${pages} pages, ~$${((pages / 1000) * 1.5).toFixed(2)} of Textract).`);
    console.log("Dry run: nothing was written. Add --apply to run Textract and save the maps.");
    return;
  }

  const report = { written: [], mismatched: [], failed: [], pages: 0 };
  let done = 0;
  await inPool(grants, args.concurrency, async (name) => {
    try {
      const [stored, { lines, pages }] = await Promise.all([
        storedText(name),
        textractLines(textract, args.grantBucket, `${name}${PDF_SUFFIX}`),
      ]);
      report.pages += pages;
      const joined = matchingJoin(stored, lines);
      if (!joined) {
        report.mismatched.push({ name, storedChars: stored?.length ?? null, textractChars: joinLines(lines).text.length });
      } else {
        await s3.send(
          new PutObjectCommand({
            Bucket: args.artifactsBucket,
            Key: pageMapKey(name),
            Body: JSON.stringify(pageMap(joined.text, joined.pageStarts)),
            ContentType: "application/json",
          })
        );
        report.written.push(name);
      }
    } catch (error) {
      report.failed.push({ name, error: error.message });
    }
    done += 1;
    if (done % 25 === 0 || done === grants.length) console.log(`${done}/${grants.length} done`);
  });

  console.log(
    `Wrote ${report.written.length} page maps; ${report.mismatched.length} grants' text no longer matches Textract (no map, no page numbers); ${report.failed.length} failed; ${report.pages} Textract pages.`
  );
  const out = args.out || `page-map-backfill-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`Report: ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
