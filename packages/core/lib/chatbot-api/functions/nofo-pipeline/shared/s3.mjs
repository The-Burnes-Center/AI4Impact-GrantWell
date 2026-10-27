import { S3Client } from "@aws-sdk/client-s3";
import { readArtifactText } from "grantwell-shared";

const s3Client = new S3Client();

export function readRawText(grantBucket, rawTextKey) {
  return readArtifactText(s3Client, rawTextKey, grantBucket);
}
