/**
 * Document types and the per-grant relevance check (document-relevance.mjs).
 *
 *   POST /user-documents/type              { key, type, description? }
 *   POST /user-documents/relevance         { documentIdentifier, documentKeys, check? }
 *   POST /user-documents/relevance/review  { documentIdentifier, key, note? }
 *   GET  /admin/document-reviews           ?status=pending|decided
 *   POST /admin/document-reviews           { action: approve|reject|open, userId, key, grant, note? }
 *
 * Admins: Developers and platform admins see every request, a state admin only their own state's users'.
 *
 * Env: USER_DOCUMENTS_BUCKET, USER_DOCUMENT_TABLE_NAME, DOC_CHECK_MODEL_ID, ARTIFACTS_BUCKET, BUCKET
 */

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { canSeeEveryState, resolveCallerScope } from 'grantwell-shared';
import { extractUserId } from '../shared/auth.mjs';
import { isOwnKey } from '../shared/keys.mjs';
import { badRequest, forbidden, serverError, success, unauthorized } from '../shared/response.mjs';
import { getBucketName, getS3Client } from '../shared/s3.mjs';
import { grantFolderName, listLibrary, normalizeEtag } from './supporting-documents.mjs';
import {
  MAX_REVIEW_NOTE_CHARS,
  cleanDocumentType,
  docSortKey,
  documentStatuses,
  documentTypeLabel,
  readRecords,
  relevanceSortKey,
  relevanceStatus,
} from './document-relevance.mjs';

const region = process.env.AWS_REGION || 'us-east-1';
const ddb = new DynamoDBClient({ region });
let bedrock;

const MAX_KEYS = 50;
const URL_EXPIRATION_SECONDS = 300;
const REVIEW_INDEX = 'ReviewIndex';
const DECIDED_LIMIT = 50;

const table = () => process.env.USER_DOCUMENT_TABLE_NAME;

function conflict(message) {
  return { statusCode: 409, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ message }) };
}

function notFound(message) {
  return { statusCode: 404, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ message }) };
}

function parseBody(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    return body && typeof body === 'object' ? body : {};
  } catch {
    return null;
  }
}

function cleanNote(note) {
  const text = String(note ?? '').replace(/\s+/g, ' ').trim();
  return text.length > MAX_REVIEW_NOTE_CHARS ? null : text;
}

function deps() {
  bedrock ??= new BedrockRuntimeClient({ region });
  return {
    ddb,
    s3: getS3Client(),
    bedrock,
    table: table(),
    bucket: getBucketName(),
    artifactBuckets: [process.env.ARTIFACTS_BUCKET, process.env.BUCKET],
    modelId: process.env.DOC_CHECK_MODEL_ID,
    source: 'api',
  };
}

async function currentEtag(key) {
  try {
    const head = await getS3Client().send(new HeadObjectCommand({ Bucket: getBucketName(), Key: key }));
    return normalizeEtag(head.ETag);
  } catch (error) {
    if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

async function setType(userId, body) {
  const { key } = body;
  if (!isOwnKey(key, userId)) return forbidden('You can only describe your own documents');
  const cleaned = cleanDocumentType(body.type, body.description);
  if (cleaned.error) return badRequest(cleaned.error);
  if (!(await currentEtag(key))) return notFound('That document is no longer in My documents');
  await ddb.send(
    new PutItemCommand({
      TableName: table(),
      Item: marshall(
        {
          user_id: userId,
          sk: docSortKey(key),
          document_key: key,
          doc_type: cleaned.type,
          description: cleaned.description,
          updated_at: new Date().toISOString(),
        },
        { removeUndefinedValues: true }
      ),
    })
  );
  return success({ key, type: cleaned.type, description: cleaned.description ?? undefined, typeLabel: documentTypeLabel(cleaned.type, cleaned.description) });
}

async function relevance(userId, body) {
  const grant = grantFolderName(body.documentIdentifier);
  if (!grant) return badRequest('documentIdentifier is required');
  if (!Array.isArray(body.documentKeys)) return badRequest('documentKeys must be a list');
  const keys = [...new Set(body.documentKeys.filter((k) => isOwnKey(k, userId)))].slice(0, MAX_KEYS);
  if (!keys.length) return success({ grant, documents: [] });
  const wanted = new Set(keys);
  const objects = (await listLibrary(getS3Client(), getBucketName(), userId)).filter((o) => wanted.has(o.key));
  const statuses = await documentStatuses(deps(), { userId, grant, objects, check: body.check !== false });
  return success({ grant, documents: objects.map((o) => ({ key: o.key, ...statuses.get(o.key) })) });
}

async function requestReview(userId, claims, body) {
  const grant = grantFolderName(body.documentIdentifier);
  const { key } = body;
  if (!grant) return badRequest('documentIdentifier is required');
  if (!isOwnKey(key, userId)) return forbidden('You can only send your own documents for review');
  const note = cleanNote(body.note);
  if (note === null) return badRequest(`Keep the note to ${MAX_REVIEW_NOTE_CHARS} characters`);
  const etag = await currentEtag(key);
  if (!etag) return notFound('That document is no longer in My documents');

  const { doc } = (await readRecords({ ddb, table: table(), userId, grant: null, keys: [key] })).get(key);
  const values = {
    ':pending': 'pending',
    ':note': note,
    ':now': new Date().toISOString(),
    ':email': String(claims.email ?? ''),
    ':state': String(claims['custom:state'] ?? '').trim().toUpperCase(),
    ':file': key.split('/').pop(),
    ':type': documentTypeLabel(doc?.doc_type, doc?.description) ?? '',
    ':etag': etag,
    ':related': 'related',
  };
  try {
    const result = await ddb.send(
      new UpdateItemCommand({
        TableName: table(),
        Key: marshall({ user_id: userId, sk: relevanceSortKey(key, grant) }),
        UpdateExpression:
          'SET review_status = :pending, review_note = :note, requested_at = :now, user_email = :email, user_state = :state, file_name = :file, type_label = :type',
        ConditionExpression: 'attribute_exists(sk) AND etag = :etag AND verdict <> :related AND attribute_not_exists(review_status)',
        ExpressionAttributeValues: marshall(values),
        ReturnValues: 'ALL_NEW',
      })
    );
    console.log('Document relevance review requested', { grant });
    return success({ key, ...relevanceStatus(unmarshall(result.Attributes), etag) });
  } catch (error) {
    if (error?.name === 'ConditionalCheckFailedException') {
      return conflict('This document has already been sent for review, or it needs checking first.');
    }
    throw error;
  }
}

function adminScope(event) {
  const scope = resolveCallerScope(event);
  if (canSeeEveryState(scope)) return scope;
  return scope.role === 'stateAdmin' && scope.state ? scope : null;
}

const inScope = (scope, row) => canSeeEveryState(scope) || (row.user_state && row.user_state === scope.state);

function reviewView(row) {
  return {
    userId: row.user_id,
    key: row.document_key,
    fileName: row.file_name || String(row.document_key ?? '').split('/').pop(),
    grant: row.grant,
    typeLabel: row.type_label || null,
    reason: row.reason || null,
    verdict: row.verdict,
    note: row.review_note || null,
    status: row.review_status,
    requestedAt: row.requested_at,
    userEmail: row.user_email || null,
    userState: row.user_state || null,
    adminNote: row.admin_note || null,
    decidedAt: row.decided_at || null,
  };
}

async function queryReviews(status, { limit, newestFirst }) {
  const rows = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: table(),
        IndexName: REVIEW_INDEX,
        KeyConditionExpression: 'review_status = :s',
        ExpressionAttributeValues: marshall({ ':s': status }),
        ScanIndexForward: !newestFirst,
        ExclusiveStartKey,
      })
    );
    rows.push(...(page.Items ?? []).map((item) => unmarshall(item)));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey && rows.length < limit);
  return rows;
}

async function listReviews(event) {
  const scope = adminScope(event);
  if (!scope) return forbidden('Only admins can review documents');
  const decided = event.queryStringParameters?.status === 'decided';
  const rows = decided
    ? (await Promise.all(['approved', 'rejected'].map((s) => queryReviews(s, { limit: DECIDED_LIMIT, newestFirst: true }))))
        .flat()
        .sort((a, b) => String(b.decided_at ?? '').localeCompare(String(a.decided_at ?? '')))
    : await queryReviews('pending', { limit: 500, newestFirst: false });
  const visible = rows.filter((row) => inScope(scope, row)).slice(0, decided ? DECIDED_LIMIT : 500);
  return success({ reviews: visible.map(reviewView) });
}

async function decideReview(event, claims, body) {
  const scope = adminScope(event);
  if (!scope) return forbidden('Only admins can review documents');
  const { action, userId, key, grant } = body;
  if (!['approve', 'reject', 'open'].includes(action)) return badRequest('action must be approve, reject or open');
  if (typeof userId !== 'string' || !userId || !isOwnKey(key, userId) || typeof grant !== 'string' || !grant) {
    return badRequest('userId, key and grant are required');
  }
  const found = await ddb.send(
    new GetItemCommand({ TableName: table(), Key: marshall({ user_id: userId, sk: relevanceSortKey(key, grant) }) })
  );
  const row = found.Item ? unmarshall(found.Item) : null;
  if (!row?.review_status || !inScope(scope, row)) return notFound('No review request for that document');
  const admin = String(claims.email || claims['cognito:username'] || '');

  if (action === 'open') {
    const name = key.split('/').pop();
    const asciiName = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
    const url = await getSignedUrl(
      getS3Client(),
      new GetObjectCommand({
        Bucket: getBucketName(),
        Key: key,
        ResponseContentDisposition: `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      }),
      { expiresIn: URL_EXPIRATION_SECONDS }
    );
    console.log('Admin opened a document under review', { admin, grant });
    return success({ url });
  }

  const note = cleanNote(body.note);
  if (note === null) return badRequest(`Keep the note to ${MAX_REVIEW_NOTE_CHARS} characters`);
  try {
    const result = await ddb.send(
      new UpdateItemCommand({
        TableName: table(),
        Key: marshall({ user_id: userId, sk: row.sk }),
        UpdateExpression: 'SET review_status = :decision, admin_note = :note, decided_at = :now, decided_by = :admin',
        ConditionExpression: 'review_status = :pending AND etag = :etag',
        ExpressionAttributeValues: marshall({
          ':decision': action === 'approve' ? 'approved' : 'rejected',
          ':note': note,
          ':now': new Date().toISOString(),
          ':admin': admin,
          ':pending': 'pending',
          ':etag': row.etag,
        }),
        ReturnValues: 'ALL_NEW',
      })
    );
    console.log('Document relevance review decided', { grant, decision: action });
    return success({ review: reviewView(unmarshall(result.Attributes)) });
  } catch (error) {
    if (error?.name === 'ConditionalCheckFailedException') return conflict('This request was already decided.');
    throw error;
  }
}

export const handler = async (event) => {
  try {
    const userId = extractUserId(event);
    if (!userId) return unauthorized();
    if (!table()) return serverError('Document checks are not configured');
    const claims = event.requestContext?.authorizer?.jwt?.claims ?? {};
    const route = event.routeKey ?? '';
    if (route === 'GET /admin/document-reviews') return await listReviews(event);

    const body = parseBody(event);
    if (!body) return badRequest('The request body must be JSON');
    switch (route) {
      case 'POST /user-documents/type':
        return await setType(userId, body);
      case 'POST /user-documents/relevance':
        return await relevance(userId, body);
      case 'POST /user-documents/relevance/review':
        return await requestReview(userId, claims, body);
      case 'POST /admin/document-reviews':
        return await decideReview(event, claims, body);
      default:
        return notFound('Unknown route');
    }
  } catch (error) {
    console.error('Document safeguards request failed:', error?.name, error?.message);
    return serverError('Unable to complete the request');
  }
};
