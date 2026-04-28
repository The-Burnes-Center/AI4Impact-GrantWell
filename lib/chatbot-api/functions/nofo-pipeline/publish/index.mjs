import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { updateProcessingStatus } from "../shared/status.mjs";

// scope/state are written by upload-nofos / scraper; publish reads them so
// the late-stage sidecar overwrite doesn't drop these fields.
async function readScopeFromMetadataTable(nofoName) {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (!tableName || !nofoName) return { scope: null, state: null };
  try {
    const result = await dynamoClient.send(
      new GetItemCommand({
        TableName: tableName,
        Key: marshall({ nofo_name: nofoName }),
      })
    );
    if (!result.Item) return { scope: null, state: null };
    const row = unmarshall(result.Item);
    return {
      scope: typeof row.scope === "string" ? row.scope : null,
      state: typeof row.state === "string" ? row.state : null,
    };
  } catch (err) {
    console.warn(`Could not read scope/state for ${nofoName}:`, err.message);
    return { scope: null, state: null };
  }
}

const s3Client = new S3Client();
const dynamoClient = new DynamoDBClient();
const lambdaClient = new LambdaClient();

export const handler = async (event) => {
  const {
    s3Bucket,
    documentKey,
    nofoName,
    mergedSummary,
    questionsData,
    applicationDeadline,
    agency,
    category,
    existingExpirationDate,
    corrections,
    contentHash,
  } = event;

  const bucket = s3Bucket || process.env.BUCKET;
  const folderPath = nofoName + "/";

  // Apply any admin corrections to the summary
  let finalSummary = mergedSummary;
  if (corrections) {
    finalSummary = { ...mergedSummary, ...corrections };
  }

  // Upload summary.json
  await uploadJson(bucket, `${folderPath}summary.json`, finalSummary);

  // Upload questions.json
  if (questionsData) {
    await uploadJson(bucket, `${folderPath}questions.json`, questionsData);
  }

  const docKey = documentKey || `${nofoName}/NOFO-File-PDF`;
  const { scope: ddbScope, state: ddbState } = await readScopeFromMetadataTable(nofoName);

  const metadata = {
    metadataAttributes: {
      documentType: "NOFO",
      documentIdentifier: nofoName,
      bucket: "nofo",
      nofoName,
      processedAt: new Date().toISOString(),
    },
  };
  if (agency) metadata.metadataAttributes.agency = agency;
  if (category) metadata.metadataAttributes.category = category;
  if (ddbScope) metadata.metadataAttributes.scope = ddbScope;
  if (ddbScope === "state" && ddbState) {
    metadata.metadataAttributes.state = ddbState;
  }

  await uploadJson(bucket, `${docKey}.metadata.json`, metadata);

  // Write to DynamoDB — use UpdateItem to preserve admin-edited fields
  // (grant_type, isPinned, created_at). Errors propagate so Step Functions
  // can retry instead of silently claiming success.
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (tableName) {
    const now = new Date().toISOString();
    const finalExpDate = existingExpirationDate || applicationDeadline || null;

    // Build SET expressions: always update these fields
    const setExprs = [
      "#status = :status",
      "updated_at = :now",
    ];
    const exprNames = { "#status": "status" };
    const exprValues = {
      ":status": "active",
      ":now": now,
    };

    // Conditionally set fields only if they have values
    // (avoids overwriting admin-set values with null)
    if (agency) {
      setExprs.push("agency = :agency");
      exprValues[":agency"] = agency;
    }
    if (category) {
      setExprs.push("category = :category");
      exprValues[":category"] = category;
    }
    if (finalExpDate) {
      setExprs.push("expiration_date = :expDate");
      exprValues[":expDate"] = finalExpDate;
    }
    if (contentHash) {
      setExprs.push("content_hash = :hash");
      exprValues[":hash"] = contentHash;
    }

    // Use if_not_exists for fields that should only be set on first write
    setExprs.push("created_at = if_not_exists(created_at, :now)");
    setExprs.push("grant_type = if_not_exists(grant_type, :defaultGrantType)");
    setExprs.push("isPinned = if_not_exists(isPinned, :defaultPinned)");
    exprValues[":defaultGrantType"] = "federal";
    exprValues[":defaultPinned"] = "false";

    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: marshall({ nofo_name: nofoName }),
        UpdateExpression: `SET ${setExprs.join(", ")}`,
        ExpressionAttributeNames: exprNames,
        ExpressionAttributeValues: marshall(exprValues),
      })
    );

    console.log(`Published NOFO metadata to DynamoDB for ${nofoName}`);
    await updateProcessingStatus(nofoName, null);
  }

  // Trigger KB sync
  const syncFunctionName = process.env.SYNC_KB_FUNCTION_NAME;
  if (syncFunctionName) {
    try {
      await lambdaClient.send(
        new InvokeCommand({
          FunctionName: syncFunctionName,
          InvocationType: "Event",
          Payload: JSON.stringify({ syncSource: "nofo" }),
        })
      );
    } catch (error) {
      console.error("Failed to invoke KB sync:", error);
    }
  }

  console.log(`Published NOFO ${nofoName} successfully`);

  return {
    statusCode: 200,
    nofoName,
    published: true,
  };
};

async function uploadJson(bucket, key, data) {
  await new Upload({
    client: s3Client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json",
    },
  }).done();
}
