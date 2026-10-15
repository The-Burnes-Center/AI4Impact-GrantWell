import { createHash } from "crypto";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
} from "@aws-sdk/client-textract";
import { updateProcessingStatus } from "../shared/status.mjs";

const s3Client = new S3Client();
const textractClient = new TextractClient({ region: process.env.AWS_REGION || 'us-east-1' });

export const handler = async (event) => {
  const { s3Bucket, documentKey, nofoName } = event;

  await updateProcessingStatus(nofoName, "extracting_text");

  const fileName = documentKey.split("/").pop();
  let documentContent;

  if (fileName === "NOFO-File-PDF") {
    documentContent = await extractPdfText(s3Bucket, documentKey);
  } else if (fileName === "NOFO-File-TXT") {
    documentContent = await extractTxtContent(s3Bucket, documentKey);
  } else {
    throw new Error(`Unsupported file type: ${fileName}`);
  }

  if (!documentContent || documentContent.length === 0) {
    throw new Error("Document content is empty after extraction.");
  }

  const rawTextKey = `${nofoName}/raw-text.txt`;
  await new Upload({
    client: s3Client,
    params: {
      Bucket: s3Bucket,
      Key: rawTextKey,
      Body: documentContent,
      ContentType: "text/plain",
    },
  }).done();

  console.log(`Extracted ${documentContent.length} chars from ${documentKey}`);

  // Source document quality gate (skip LLM for obviously bad documents)
  const qualityIssues = [];
  if (documentContent.length < 500) {
    qualityIssues.push("Document too short (< 500 chars)");
  }
  if (documentContent.length > 0) {
    const grantKeywords = ["grant", "funding", "applicant", "eligib", "award", "nofo", "notice",
      "opportunity", "program", "federal", "application", "deadline", "narrative", "budget"];
    // Sample from beginning and middle of document to handle NOFOs with long preambles
    const sampleSize = 5000;
    const mid = Math.floor(documentContent.length / 2);
    const lowerSample = (
      documentContent.substring(0, sampleSize) +
      documentContent.substring(mid, mid + sampleSize)
    ).toLowerCase();
    const matchCount = grantKeywords.filter((kw) => lowerSample.includes(kw)).length;
    if (matchCount < 2) {
      qualityIssues.push("Document does not appear to be a grant document (missing key terms)");
    }
  }
  const sourceQualityFailed = qualityIssues.length > 0;

  // Content fingerprint retained for reference/indexing only. Content-hash
  // duplicate DETECTION was removed: distinct grants that share agency
  // boilerplate (EDA city variants, NASA ROSES elements, FEMA CTP regions)
  // collide on the first-50K hash and were wrongly quarantined as duplicates
  // of one another. A false duplicate hides a real grant, which is worse than
  // occasionally admitting a true duplicate.
  const contentHash = createHash("sha256")
    .update(documentContent.substring(0, 50000))
    .digest("hex");

  return {
    ...event,
    rawTextKey,
    documentLength: documentContent.length,
    contentHash,
    ...(sourceQualityFailed && { sourceQualityFailed: true, qualityIssues }),
  };
};

const TEXTRACT_POLL_INTERVAL_MS = 5000;
// Leaves the 15-minute Lambda time to page the results and upload them.
export const MAX_TEXTRACT_WAIT_MS = 13 * 60 * 1000;

export class TextractTimeoutError extends Error {
  constructor(jobId) {
    super(
      `Text extraction did not finish within ${MAX_TEXTRACT_WAIT_MS / 60000} minutes (Textract job ${jobId}). ` +
        "The PDF may be very long or scanned; reprocess it later or upload a smaller or text-based PDF."
    );
    this.name = "TextractTimeoutError";
  }
}

async function extractPdfText(bucket, key) {
  const startResponse = await textractClient.send(
    new StartDocumentTextDetectionCommand({
      DocumentLocation: { S3Object: { Bucket: bucket, Name: key } },
    })
  );

  const jobId = startResponse.JobId;
  const deadline = Date.now() + MAX_TEXTRACT_WAIT_MS;
  let status = "IN_PROGRESS";

  while (status === "IN_PROGRESS") {
    if (Date.now() + TEXTRACT_POLL_INTERVAL_MS > deadline) {
      throw new TextractTimeoutError(jobId);
    }
    await new Promise((resolve) => setTimeout(resolve, TEXTRACT_POLL_INTERVAL_MS));
    const result = await textractClient.send(
      new GetDocumentTextDetectionCommand({ JobId: jobId })
    );
    status = result.JobStatus;
  }

  if (status !== "SUCCEEDED") {
    throw new Error(`Textract job failed with status: ${status}`);
  }

  let allBlocks = [];
  let nextToken = null;

  do {
    const result = await textractClient.send(
      new GetDocumentTextDetectionCommand({ JobId: jobId, NextToken: nextToken })
    );
    if (Array.isArray(result.Blocks)) {
      allBlocks = allBlocks.concat(result.Blocks);
    }
    nextToken = result.NextToken;
  } while (nextToken);

  return allBlocks
    .filter((block) => block.BlockType === "LINE")
    .map((line) => line.Text)
    .join("\n");
}

async function extractTxtContent(bucket, key) {
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
