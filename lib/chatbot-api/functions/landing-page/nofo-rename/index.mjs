/**
 * This Lambda function renames a NOFO.
 *
 * A rename touches four places, because the NOFO's folder name doubles as its identity:
 *   1. S3 — copy every object under `oldName/` to `newName/`, then delete the originals.
 *   2. The `.metadata.json` sidecars — these embed `documentIdentifier` (the old folder path),
 *      and websocket-chat filters KB retrieval on exactly that value, so copying them verbatim
 *      would leave chat returning nothing for the renamed NOFO.
 *   3. The metadata table — `nofo_name` is the partition key, so the row must be re-created
 *      under the new name and the old one deleted. The dashboard lists from DynamoDB, so
 *      skipping this makes the renamed NOFO invisible while the old name lingers.
 *   4. The state-overlay table — rows are keyed (nofo_name, state) and would otherwise orphan.
 *
 * Order matters: the DynamoDB row is claimed first, with a conditional write that both rejects
 * a collision with an existing NOFO and serializes concurrent renames. S3 objects are copied
 * before anything is deleted, so a mid-run failure leaves the source intact.
 */

import { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand, QueryCommand, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { requireAdmin, assertCanEditNofoOr403 } from 'grantwell-shared';

const dynamoClient = new DynamoDBClient();
const scopeDeps = { client: dynamoClient, GetItemCommand, marshall, unmarshall };

const METADATA_TABLE = process.env.NOFO_METADATA_TABLE_NAME;
const OVERLAY_TABLE = process.env.NOFO_STATE_OVERLAY_TABLE_NAME;
const ENABLE_DYNAMODB_CACHE = process.env.ENABLE_DYNAMODB_CACHE === 'true';

const response = (statusCode, body) => ({
  statusCode,
  headers: { 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  const s3Bucket = process.env.BUCKET;
  const s3Client = new S3Client({ requestChecksumCalculation: 'WHEN_REQUIRED' });

  const forbidden = requireAdmin(event);
  if (forbidden) return forbidden;

  let claimedNewRow = false;
  let newName;

  try {
    const requestBody = JSON.parse(event.body);
    const { oldName } = requestBody;
    newName = requestBody.newName;

    if (!oldName || !newName) {
      return response(400, { message: "Both 'oldName' and 'newName' are required in request body" });
    }

    if (oldName === newName) {
      return response(400, { message: 'The new name is the same as the current name' });
    }

    // The folder name becomes an S3 key prefix; a name that escapes its own prefix would
    // let a rename write outside the NOFO's folder.
    if (newName.includes('/') || newName.startsWith('.') || newName.includes('..')) {
      return response(400, { message: "Invalid new name: cannot contain '/' or '..', or begin with '.'" });
    }

    // A rename mutates the source NOFO; a state admin may only rename their own state's.
    const denied = await assertCanEditNofoOr403(
      event, scopeDeps, METADATA_TABLE, oldName
    );
    if (denied) return denied;

    const objects = await listFolder(s3Client, s3Bucket, oldName);
    if (objects.length === 0) {
      return response(404, { message: `Folder '${oldName}' not found or empty` });
    }

    // Claim the new name before touching S3. The conditional put fails if any NOFO already
    // holds it — which also means a second concurrent rename to the same target loses here
    // rather than halfway through copying objects.
    if (ENABLE_DYNAMODB_CACHE && METADATA_TABLE) {
      const sourceRow = await readMetadataRow(oldName);
      if (!sourceRow) {
        return response(404, { message: `No metadata found for '${oldName}'. Cannot rename.` });
      }
      try {
        await dynamoClient.send(new PutItemCommand({
          TableName: METADATA_TABLE,
          Item: marshall(
            { ...sourceRow, nofo_name: newName, updated_at: new Date().toISOString() },
            { removeUndefinedValues: true }
          ),
          ConditionExpression: 'attribute_not_exists(nofo_name)',
        }));
        claimedNewRow = true;
      } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
          return response(409, { message: `A grant named '${newName}' already exists.` });
        }
        throw error;
      }
    }

    // Copy everything first; the source stays intact until every object has landed.
    for (const object of objects) {
      const destinationKey = object.Key.replace(`${oldName}/`, `${newName}/`);
      await s3Client.send(new CopyObjectCommand({
        Bucket: s3Bucket,
        CopySource: encodeURI(`${s3Bucket}/${object.Key}`),
        Key: destinationKey,
      }));
    }

    // The copied sidecars still carry the old documentIdentifier — rewrite them in place.
    await rewriteMetadataSidecars(s3Client, s3Bucket, objects, oldName, newName);

    for (const object of objects) {
      await s3Client.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: object.Key }));
    }

    if (claimedNewRow) {
      await dynamoClient.send(new DeleteItemCommand({
        TableName: METADATA_TABLE,
        Key: marshall({ nofo_name: oldName }),
      }));
    }

    await migrateStateOverlays(oldName, newName);

    // The KB still indexes the old prefix and has no entry for the new one.
    await triggerKbSync(newName);

    return response(200, {
      message: `Successfully renamed folder from '${oldName}' to '${newName}'`,
    });
  } catch (error) {
    console.error('Error renaming NOFO folder:', error);

    // Release the claimed name so the rename can be retried; leaving it would make the
    // NOFO appear under both names in the dashboard.
    if (claimedNewRow) {
      try {
        await dynamoClient.send(new DeleteItemCommand({
          TableName: METADATA_TABLE,
          Key: marshall({ nofo_name: newName }),
        }));
      } catch (rollbackError) {
        console.error(`Failed to roll back claimed metadata row '${newName}':`, rollbackError);
      }
    }

    return response(500, {
      message: 'Failed to rename NOFO folder. Internal Server Error.',
      error: error.message,
    });
  }
};

async function listFolder(s3Client, bucket, prefix) {
  const items = [];
  let continuationToken;
  do {
    const listed = await s3Client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `${prefix}/`,
      ContinuationToken: continuationToken,
    }));
    if (listed.Contents) items.push(...listed.Contents);
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
  return items;
}

async function readMetadataRow(nofoName) {
  const result = await dynamoClient.send(new GetItemCommand({
    TableName: METADATA_TABLE,
    Key: marshall({ nofo_name: nofoName }),
  }));
  return result.Item ? unmarshall(result.Item) : null;
}

/**
 * Rewrite `documentIdentifier` in the sidecars that were just copied to the new prefix.
 * Failure here is non-fatal for the rename itself but breaks KB filtering, so it's logged loudly.
 */
async function rewriteMetadataSidecars(s3Client, bucket, objects, oldName, newName) {
  const sidecars = objects.filter((object) => object.Key.endsWith('.metadata.json'));

  for (const sidecar of sidecars) {
    const destinationKey = sidecar.Key.replace(`${oldName}/`, `${newName}/`);
    try {
      const stored = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: destinationKey }));
      const metadata = JSON.parse(await stored.Body.transformToString());

      if (metadata?.metadataAttributes?.documentIdentifier === undefined) continue;
      metadata.metadataAttributes.documentIdentifier = newName;

      await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: destinationKey,
        Body: JSON.stringify(metadata, null, 2),
        ContentType: 'application/json',
      }));
    } catch (error) {
      console.error(`Failed to rewrite sidecar '${destinationKey}' (KB filtering may be stale):`, error);
    }
  }
}

/**
 * Move (nofo_name, state) overlay rows onto the new name. Non-fatal: an orphaned overlay
 * costs a state its guidance note, not the NOFO itself.
 */
async function migrateStateOverlays(oldName, newName) {
  if (!OVERLAY_TABLE) return;

  try {
    let lastEvaluatedKey;
    const rows = [];
    do {
      const page = await dynamoClient.send(new QueryCommand({
        TableName: OVERLAY_TABLE,
        KeyConditionExpression: 'nofo_name = :n',
        ExpressionAttributeValues: marshall({ ':n': oldName }),
        ExclusiveStartKey: lastEvaluatedKey,
      }));
      if (page.Items) rows.push(...page.Items.map((item) => unmarshall(item)));
      lastEvaluatedKey = page.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    if (rows.length === 0) return;

    for (let i = 0; i < rows.length; i += 25) {
      const batch = rows.slice(i, i + 25);
      await dynamoClient.send(new BatchWriteItemCommand({
        RequestItems: {
          [OVERLAY_TABLE]: [
            ...batch.map((row) => ({
              PutRequest: { Item: marshall({ ...row, nofo_name: newName }, { removeUndefinedValues: true }) },
            })),
            ...batch.map((row) => ({
              DeleteRequest: { Key: marshall({ nofo_name: oldName, state: row.state }) },
            })),
          ],
        },
      }));
    }
    console.log(`Migrated ${rows.length} state overlay row(s) from '${oldName}' to '${newName}'`);
  } catch (error) {
    console.error(`Failed to migrate state overlays for '${oldName}' (non-critical):`, error);
  }
}

async function triggerKbSync(newName) {
  const syncFunctionName = process.env.SYNC_KB_FUNCTION_NAME;
  if (!syncFunctionName) return;

  try {
    const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
    await lambdaClient.send(new InvokeCommand({
      FunctionName: syncFunctionName,
      InvocationType: 'Event',
      Payload: JSON.stringify({ syncSource: 'nofo' }),
    }));
    console.log(`Triggered KB sync after renaming NOFO to '${newName}'`);
  } catch (syncError) {
    console.error(`Failed to trigger KB sync (non-critical): ${syncError}`);
  }
}
