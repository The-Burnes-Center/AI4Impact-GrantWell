/**
 * Lists the caller's document library: every object under "<userId>/", which holds new uploads
 * in "<userId>/documents/" and older ones in per-grant folders (some with a doubled slash), each
 * with the type the user gave it (null when none was set).
 *
 * Env: USER_DOCUMENTS_BUCKET, USER_DOCUMENT_TABLE_NAME
 */

import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { extractUserId } from '../shared/auth.mjs';
import { success, unauthorized, serverError } from '../shared/response.mjs';
import { getS3Client, getBucketName } from '../shared/s3.mjs';

// A library this large is far past anything the UI can show; stop rather than run the Lambda long.
const MAX_OBJECTS = 5000;

let ddb;

export function describeDocument(userId, object, types = new Map()) {
  const rest = object.Key.slice(userId.length + 1);
  const segments = rest.split('/');
  const name = segments.pop();
  const folder = segments.filter(Boolean).join('/');
  const typed = types.get(object.Key);
  return {
    key: object.Key,
    name,
    folder,
    size: object.Size ?? 0,
    lastModified: object.LastModified,
    type: typed?.doc_type ?? null,
    ...(typed?.description && { description: typed.description }),
  };
}

/** document key -> its DOC row; empty (every type shows as not set) when the table can't be read. */
async function documentTypes(userId) {
  const table = process.env.USER_DOCUMENT_TABLE_NAME;
  const types = new Map();
  if (!table) return types;
  ddb ??= new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
  try {
    let ExclusiveStartKey;
    do {
      const page = await ddb.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: 'user_id = :u AND begins_with(sk, :doc)',
          ExpressionAttributeValues: marshall({ ':u': userId, ':doc': 'DOC#' }),
          ExclusiveStartKey,
        })
      );
      for (const row of (page.Items || []).map((item) => unmarshall(item))) types.set(row.document_key, row);
      ExclusiveStartKey = page.LastEvaluatedKey;
    } while (ExclusiveStartKey);
  } catch (e) {
    console.warn('Could not read document types:', e?.name);
  }
  return types;
}

export const handler = async (event) => {
  try {
    const userId = extractUserId(event);
    if (!userId) return unauthorized();

    const prefix = `${userId}/`;
    const typesRead = documentTypes(userId);
    const objects = [];
    let ContinuationToken;
    do {
      const page = await getS3Client().send(
        new ListObjectsV2Command({ Bucket: getBucketName(), Prefix: prefix, ContinuationToken })
      );
      for (const object of page.Contents || []) {
        if (object.Key.endsWith('/') || object.Key.endsWith('.metadata.json')) continue;
        objects.push(object);
      }
      ContinuationToken = page.IsTruncated && objects.length < MAX_OBJECTS ? page.NextContinuationToken : undefined;
    } while (ContinuationToken);

    const types = await typesRead;
    const documents = objects.map((object) => describeDocument(userId, object, types));
    console.log('Listed documents', { bucket: getBucketName(), prefix, count: documents.length });

    return success({ documents });
  } catch (e) {
    console.error('Error listing documents:', e.message);
    return serverError('Unable to list documents');
  }
};
