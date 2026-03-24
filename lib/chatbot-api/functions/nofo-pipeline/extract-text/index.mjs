import { createHash } from "crypto";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
} from "@aws-sdk/client-textract";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { updateProcessingStatus } from "../shared/status.mjs";

const s3Client = new S3Client();
const textractClient = new TextractClient({ region: "us-east-1" });
const dynamoClient = new DynamoDBClient();

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
      qualityIssues.push("Document does not appear to be a grant/NOFO (missing key terms)");
    }
  }
  const sourceQualityFailed = qualityIssues.length > 0;

  // Content fingerprint for duplicate detection — hash first 50K chars
  // to balance collision avoidance with consistent hashing for large docs
  const contentHash = createHash("sha256")
    .update(documentContent.substring(0, 50000))
    .digest("hex");

  let duplicateOf = null;
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (tableName) {
    try {
      const queryResult = await dynamoClient.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: "ContentHashIndex",
          KeyConditionExpression: "content_hash = :hash",
          ExpressionAttributeValues: { ":hash": { S: contentHash } },
        })
      );
      const matches = (queryResult.Items || []).map((item) => unmarshall(item));
      const otherMatch = matches.find((m) => m.nofo_name !== nofoName);
      if (otherMatch) {
        duplicateOf = otherMatch.nofo_name;
        console.log(`Duplicate detected: ${nofoName} matches existing ${duplicateOf}`);
      }
    } catch (err) {
      console.warn("Duplicate check failed:", err.message);
    }
  }

  return {
    ...event,
    rawTextKey,
    documentLength: documentContent.length,
    contentHash,
    ...(sourceQualityFailed && { sourceQualityFailed: true, qualityIssues }),
    ...(duplicateOf && { duplicateOf }),
  };
};

const MAX_TEXTRACT_POLLS = 120; // 120 * 5s = 10 min max wait

async function extractPdfText(bucket, key) {
  const startResponse = await textractClient.send(
    new StartDocumentTextDetectionCommand({
      DocumentLocation: { S3Object: { Bucket: bucket, Name: key } },
    })
  );

  const jobId = startResponse.JobId;
  let status = "IN_PROGRESS";
  let polls = 0;

  while (status === "IN_PROGRESS") {
    if (++polls > MAX_TEXTRACT_POLLS) {
      throw new Error(`Textract job ${jobId} timed out after ${MAX_TEXTRACT_POLLS * 5}s`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
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
