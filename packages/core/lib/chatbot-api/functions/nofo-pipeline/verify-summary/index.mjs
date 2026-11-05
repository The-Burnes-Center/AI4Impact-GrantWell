/**
 * VerifySummary pipeline step, between Synthesize and ContentCheck. Checks every Requirements page
 * item against the grant (see shared/verify-requirements.mjs), keeps rewrites that pass, writes
 * requirements-citations.json, and hands ContentCheck the failing items by name and reason only,
 * so the Step Functions payload stays small.
 */

import { S3Client } from "@aws-sdk/client-s3";
import { isMissingObject, putArtifact, readArtifactText } from "grantwell-shared";
import { readRawText } from "../shared/s3.mjs";
import { CITATIONS_FILE } from "../shared/cite.mjs";
import { pageMapKey, usablePageStarts } from "../extract-text/page-map.mjs";
import { verifyRequirements } from "../shared/verify-requirements.mjs";

const s3 = new S3Client();

async function readOptional(key) {
  try {
    return await readArtifactText(s3, key);
  } catch (error) {
    if (isMissingObject(error)) return null;
    throw error;
  }
}

const parseOrNull = (text) => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

export const handler = async (event) => {
  const { nofoName, s3Bucket, rawTextKey, mergedSummary } = event;

  const [rawText, mapText, existingText] = await Promise.all([
    readRawText(s3Bucket, rawTextKey),
    readOptional(pageMapKey(nofoName)),
    readOptional(`${nofoName}/${CITATIONS_FILE}`),
  ]);
  let pageStarts = null;
  try {
    pageStarts = mapText ? usablePageStarts(JSON.parse(mapText), rawText) : null;
  } catch {}

  const result = await verifyRequirements({ nofoName, summary: mergedSummary, rawText, pageStarts });

  if (result.citationsFile) {
    const approval = parseOrNull(existingText)?.approval;
    const file = { ...result.citationsFile, ...(approval && { approval }) };
    await putArtifact(s3, `${nofoName}/${CITATIONS_FILE}`, JSON.stringify(file), "application/json");
  }

  console.log(
    `Verified ${nofoName}: ${result.failing.length} failing, ${result.rewritten.length} rewritten`,
    result.failing.map((f) => `${f.category}: ${f.item}`)
  );

  const deadline = result.summary?.application_deadline || null;
  return {
    ...event,
    mergedSummary: result.summary,
    ...(deadline !== (mergedSummary?.application_deadline || null) && { applicationDeadline: deadline }),
    failingItems: result.failing,
  };
};
