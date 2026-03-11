/**
 * Lists documents in a user's S3 folder.
 *
 * Env: USER_DOCUMENTS_BUCKET
 */

import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { extractUserId } from '../shared/auth.mjs';
import { success, unauthorized, forbidden, serverError } from '../shared/response.mjs';
import { getS3Client, getBucketName } from '../shared/s3.mjs';

export const handler = async (event) => {
  try {
    const userId = extractUserId(event);
    if (!userId) return unauthorized();

    const body = JSON.parse(event.body);
    const folderPrefix = body.folderPrefix || '';

    if (!folderPrefix.startsWith(`${userId}/`)) {
      return forbidden('Unauthorized: Can only access your own folder');
    }

    const result = await getS3Client().send(
      new ListObjectsV2Command({
        Bucket: getBucketName(),
        Prefix: folderPrefix,
        Delimiter: '/',
        ContinuationToken: body.continuationToken,
      })
    );

    console.log('Listed documents', { bucket: getBucketName(), prefix: folderPrefix, count: result.KeyCount });

    return success(result);
  } catch (e) {
    console.error('Error listing documents:', e.message);
    return serverError('Unable to list documents');
  }
};
