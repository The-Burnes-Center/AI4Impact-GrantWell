import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
} from "@aws-sdk/client-textract";

const s3Client = new S3Client();
const textractClient = new TextractClient({ region: "us-east-1" });

export const handler = async (event) => {
  const { s3Bucket, documentKey, nofoName } = event;

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

  return {
    ...event,
    rawTextKey,
    documentLength: documentContent.length,
  };
};

async function extractPdfText(bucket, key) {
  const startResponse = await textractClient.send(
    new StartDocumentTextDetectionCommand({
      DocumentLocation: { S3Object: { Bucket: bucket, Name: key } },
    })
  );

  const jobId = startResponse.JobId;
  let status = "IN_PROGRESS";

  while (status === "IN_PROGRESS") {
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
