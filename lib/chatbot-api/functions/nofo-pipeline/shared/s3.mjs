import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client();

export async function readS3Text(bucket, key) {
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
