/**
 * "Promote to state copy" — fork a federal NOFO into a state-owned copy.
 *
 * A state admin who needs to change more than an overlay note can clone a federal NOFO into a
 * new `scope: "state"` record their state fully owns and edits via the normal handlers. This
 * copies the S3 folder and the metadata row (grant_type/agency/category/dates), stamping the new
 * row `scope: "state"`, `state: <caller's state>`, `status: "active"`. The federal original is
 * untouched. The copy does NOT track later federal edits — it's an independent record from here.
 *
 *   POST /nofo-promote-copy { nofoName }  -> { newName }
 */

import { S3Client, ListObjectsV2Command, CopyObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { requireAdmin, resolveCallerScope, jsonResponse, stateNameFromCode } from "grantwell-shared";

const s3Client = new S3Client({ requestChecksumCalculation: "WHEN_REQUIRED" });
const dynamoClient = new DynamoDBClient();

const BUCKET = process.env.BUCKET;
const METADATA_TABLE = process.env.NOFO_METADATA_TABLE_NAME;

export const handler = async (event) => {
  const forbidden = requireAdmin(event);
  if (forbidden) return forbidden;

  try {
    const { nofoName } = JSON.parse(event.body || "{}");
    if (!nofoName) return jsonResponse(400, { message: "Missing 'nofoName'" });

    const callerScope = resolveCallerScope(event);
    // The copy is owned by a state, so the caller must have one. A developer/regular admin has
    // no single target state — they should create state NOFOs through the normal upload flow.
    if (callerScope.role !== "stateAdmin") {
      return jsonResponse(400, {
        message: "Only a state admin can promote a federal NOFO to their state's copy.",
      });
    }
    const targetState = callerScope.state;

    const sourceRow = await readMetadataRow(nofoName);
    if (!sourceRow) return jsonResponse(404, { message: `NOFO "${nofoName}" not found.` });
    if (sourceRow.scope && sourceRow.scope !== "federal") {
      return jsonResponse(400, { message: "Only federal NOFOs can be promoted to a state copy." });
    }

    // Suffix the copy so it's distinguishable and won't collide with the federal original.
    const newName = `${nofoName} (${stateNameFromCode(targetState)})`;
    if (await readMetadataRow(newName)) {
      return jsonResponse(409, { message: `A copy named "${newName}" already exists.` });
    }

    await copyS3Folder(nofoName, newName);
    await writeStateCopyRow(newName, targetState, sourceRow);

    return jsonResponse(200, { newName, state: targetState });
  } catch (error) {
    console.error("Promote-copy error:", error);
    return jsonResponse(500, { message: error?.message || "Failed to promote NOFO." });
  }
};

async function readMetadataRow(nofoName) {
  if (!METADATA_TABLE) return null;
  const result = await dynamoClient.send(
    new GetItemCommand({ TableName: METADATA_TABLE, Key: marshall({ nofo_name: nofoName }) })
  );
  return result.Item ? unmarshall(result.Item) : null;
}

async function copyS3Folder(oldName, newName) {
  let continuationToken;
  let copied = 0;
  do {
    const listed = await s3Client.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `${oldName}/`, ContinuationToken: continuationToken })
    );
    for (const object of listed.Contents || []) {
      const destinationKey = object.Key.replace(`${oldName}/`, `${newName}/`);
      await s3Client.send(
        new CopyObjectCommand({
          Bucket: BUCKET,
          CopySource: encodeURI(`${BUCKET}/${object.Key}`),
          Key: destinationKey,
        })
      );
      copied += 1;
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);

  if (copied === 0) {
    const err = new Error(`Source NOFO "${oldName}" has no files to copy.`);
    err.statusCode = 404;
    throw err;
  }
}

async function writeStateCopyRow(newName, state, sourceRow) {
  const now = new Date().toISOString();
  await dynamoClient.send(
    new PutItemCommand({
      TableName: METADATA_TABLE,
      Item: marshall(
        {
          nofo_name: newName,
          scope: "state",
          state,
          status: "active",
          // Carry over display metadata; drop processing/review fields — the copy is already live.
          grant_type: sourceRow.grant_type ?? null,
          agency: sourceRow.agency ?? null,
          category: sourceRow.category ?? null,
          expiration_date: sourceRow.expiration_date ?? null,
          is_rolling: sourceRow.is_rolling ?? "false",
          isPinned: "false",
          created_at: now,
          updated_at: now,
        },
        { removeUndefinedValues: true }
      ),
    })
  );
}
