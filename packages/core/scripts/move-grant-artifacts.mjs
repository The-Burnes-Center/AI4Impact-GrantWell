#!/usr/bin/env node
/**
 * Moves every grant's raw-text.txt, summary.json and questions.json out of the grant bucket, which the
 * Knowledge Base indexes, into the artifacts bucket, then starts a KB sync so their passages are dropped.
 * Run once per deployment after the release that adds the artifacts bucket. A file already in the
 * artifacts bucket was written by the new code and is newer, so only the old copy is deleted. The grant
 * bucket is versioned, so a deleted copy stays recoverable as a noncurrent version.
 *
 * Bucket names and the KB data source ("<kb id>|<data source id>") come from the app stack:
 *   aws cloudformation list-stack-resources --stack-name <stack> --query "StackResourceSummaries[?
 *     starts_with(LogicalResourceId,'ChatbotAPIffioNofosDownloadBucket') || starts_with(LogicalResourceId,
 *     'ChatbotAPIGrantArtifactsBucket') || starts_with(LogicalResourceId,'ChatbotAPIS3DataSource')]"
 *
 * Dry run (default):
 *   node scripts/move-grant-artifacts.mjs --grant-bucket <name> --artifacts-bucket <name>
 * Apply:
 *   node scripts/move-grant-artifacts.mjs --grant-bucket <name> --artifacts-bucket <name> --data-source "<kb>|<ds>" --apply
 */

import { fileURLToPath } from "node:url";
import { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { BedrockAgentClient, StartIngestionJobCommand } from "@aws-sdk/client-bedrock-agent";
import { copySource } from "../lib/chatbot-api/functions/layers/js-shared-layer/nodejs/node_modules/grantwell-shared/artifacts.mjs";

export const DERIVED_KEY = /^[^/]+\/(raw-text\.txt|summary\.json|questions\.json)$/;

/** Derived files still in the grant bucket: `copy` are missing from the artifacts bucket, `keep` are already there. */
export function planMove(grantKeys, artifactKeys) {
  const existing = new Set(artifactKeys);
  const derived = grantKeys.filter((key) => DERIVED_KEY.test(key));
  return {
    copy: derived.filter((key) => !existing.has(key)),
    keep: derived.filter((key) => existing.has(key)),
  };
}

function parseArgs(argv) {
  const args = { apply: false, region: process.env.AWS_REGION || "us-east-1" };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--grant-bucket") args.grantBucket = argv[++i];
    else if (arg === "--artifacts-bucket") args.artifactsBucket = argv[++i];
    else if (arg === "--data-source") args.dataSource = argv[++i];
    else if (arg === "--region") args.region = argv[++i];
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  if (!args.grantBucket || !args.artifactsBucket) {
    console.error("--grant-bucket and --artifacts-bucket are required");
    process.exit(1);
  }
  if (args.apply && !/^[A-Z0-9]+\|[A-Z0-9]+$/.test(args.dataSource || "")) {
    console.error('--apply needs --data-source "<knowledge base id>|<data source id>" to start the sync');
    process.exit(1);
  }
  return args;
}

async function listKeys(s3, bucket) {
  const keys = [];
  let continuationToken;
  do {
    const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }));
    for (const object of listed.Contents || []) keys.push(object.Key);
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
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
  const [grantKeys, artifactKeys] = await Promise.all([listKeys(s3, args.grantBucket), listKeys(s3, args.artifactsBucket)]);
  const plan = planMove(grantKeys, artifactKeys);

  console.log(`${args.grantBucket}: ${grantKeys.length} files, ${plan.copy.length + plan.keep.length} derived.`);
  console.log(`  copy to ${args.artifactsBucket}, then delete: ${plan.copy.length}`);
  console.log(`  already in ${args.artifactsBucket}, delete old copy: ${plan.keep.length}`);

  if (!args.apply) {
    console.log("\nDry run. Re-run with --apply to move.");
    return;
  }

  const moved = [...plan.keep];
  const copyFailed = [];
  const deleteFailed = [];
  await inPool(plan.copy, 16, async (key) => {
    try {
      await s3.send(
        new CopyObjectCommand({ Bucket: args.artifactsBucket, CopySource: copySource(args.grantBucket, key), Key: key })
      );
      moved.push(key);
    } catch (error) {
      copyFailed.push(key);
      console.error(`  copy failed: ${key}: ${error?.message}`);
    }
  });

  for (let i = 0; i < moved.length; i += 1000) {
    const result = await s3.send(
      new DeleteObjectsCommand({
        Bucket: args.grantBucket,
        Delete: { Objects: moved.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
      })
    );
    for (const error of result.Errors || []) {
      deleteFailed.push(error.Key);
      console.error(`  delete failed: ${error.Key}: ${error.Message}`);
    }
  }
  console.log(
    `\nMoved ${moved.length - deleteFailed.length} of ${plan.copy.length + plan.keep.length};` +
      ` ${copyFailed.length} copies and ${deleteFailed.length} deletes failed (re-run to retry them).`
  );

  const [knowledgeBaseId, dataSourceId] = args.dataSource.split("|");
  try {
    const { ingestionJob } = await new BedrockAgentClient({ region: args.region }).send(
      new StartIngestionJobCommand({ knowledgeBaseId, dataSourceId })
    );
    console.log(`Started KB sync ${ingestionJob?.ingestionJobId}; the old passages go when it completes.`);
  } catch (error) {
    console.error(`Could not start the KB sync (${error?.name}: ${error?.message}). Start it once the running sync finishes.`);
  }
  if (copyFailed.length || deleteFailed.length) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
