/**
 * Lists the caller's document library: every object under "<userId>/", which holds new uploads
 * in "<userId>/documents/" and older ones in per-grant folders (some with a doubled slash).
 *
 * Env: USER_DOCUMENTS_BUCKET
 */

import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { extractUserId } from '../shared/auth.mjs';
import { success, unauthorized, serverError } from '../shared/response.mjs';
import { getS3Client, getBucketName } from '../shared/s3.mjs';

// A library this large is far past anything the UI can show; stop rather than run the Lambda long.
const MAX_OBJECTS = 5000;

export function describeDocument(userId, object) {
  const rest = object.Key.slice(userId.length + 1);
  const segments = rest.split('/');
  const name = segments.pop();
  const folder = segments.filter(Boolean).join('/');
  return { key: object.Key, name, folder, size: object.Size ?? 0, lastModified: object.LastModified };
}

export const handler = async (event) => {
  try {
    const userId = extractUserId(event);
    if (!userId) return unauthorized();

    const prefix = `${userId}/`;
    const documents = [];
    let ContinuationToken;
    do {
      const page = await getS3Client().send(
        new ListObjectsV2Command({ Bucket: getBucketName(), Prefix: prefix, ContinuationToken })
      );
      for (const object of page.Contents || []) {
        if (object.Key.endsWith('/') || object.Key.endsWith('.metadata.json')) continue;
        documents.push(describeDocument(userId, object));
      }
      ContinuationToken = page.IsTruncated && documents.length < MAX_OBJECTS ? page.NextContinuationToken : undefined;
    } while (ContinuationToken);

    console.log('Listed documents', { bucket: getBucketName(), prefix, count: documents.length });

    return success({ documents });
  } catch (e) {
    console.error('Error listing documents:', e.message);
    return serverError('Unable to list documents');
  }
};
