/**
 * A grant is live when its metadata status is active or archived and it has a published
 * summary.json. A pipeline run on a live grant (reprocess, re-upload, scraper update) leaves that
 * version up: the status stays as it is, processing_status tracks the run, and only the new version
 * waits for the checks. A grant with no published version (new, or held for review) is not live.
 */

import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";

export const LIVE_STATUSES = ["active", "archived"];

const s3 = new S3Client();

const isMissing = (error) =>
  error?.name === "NotFound" || error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404;

/** True or false when known; null when S3 can't say (no bucket configured, or a read error). */
export async function hasPublishedSummary(nofoName) {
  const buckets = [process.env.ARTIFACTS_BUCKET, process.env.BUCKET].filter(Boolean);
  if (!nofoName || buckets.length === 0) return null;
  try {
    for (const bucket of buckets) {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: `${nofoName}/summary.json` }));
        return true;
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }
    return false;
  } catch (error) {
    console.warn(`Could not check for a published summary of ${nofoName}:`, error.message);
    return null;
  }
}

/**
 * The status the grant's published version is live under, or null. `unknownIsLive` decides an S3
 * error: callers about to hide or delete a grant pass true, so a failed read never takes it down.
 */
export async function liveStatusOf(nofoName, row, { unknownIsLive = false } = {}) {
  if (!LIVE_STATUSES.includes(row?.status)) return null;
  const published = await hasPublishedSummary(nofoName);
  return published === true || (published === null && unknownIsLive) ? row.status : null;
}
