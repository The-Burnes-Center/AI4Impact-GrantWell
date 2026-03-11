/**
 * Shared S3 utilities for user-document Lambdas.
 * Provides a lazy-initialized S3 client and bucket-name accessor.
 *
 * Required env: USER_DOCUMENTS_BUCKET
 */

import { S3Client } from '@aws-sdk/client-s3';

let _client;

export function getS3Client() {
  if (!_client) {
    _client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  }
  return _client;
}

export function getBucketName() {
  return process.env.USER_DOCUMENTS_BUCKET;
}
