import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { DynamoDBClient, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { updateProcessingStatus } from "../shared/status.mjs";

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
    validationResult,
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

  // Create metadata file for KB filtering
  const docKey = documentKey || `${nofoName}/NOFO-File-PDF`;
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

  await uploadJson(bucket, `${docKey}.metadata.json`, metadata);

  // Write to DynamoDB
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (tableName) {
    try {
      const now = new Date().toISOString();

      let existingGrantType = "federal";
      let existingAgency = agency;
      let existingCategory = category;
      let existingExpDate = existingExpirationDate;
      let existingCreatedAt = now;

      try {
        const existing = await dynamoClient.send(
          new GetItemCommand({
            TableName: tableName,
            Key: marshall({ nofo_name: nofoName }),
          })
        );
        if (existing.Item) {
          const item = unmarshall(existing.Item);
          existingGrantType = item.grant_type || "federal";
          existingAgency = existingAgency || item.agency || null;
          existingCategory = existingCategory || item.category || null;
          existingExpDate = existingExpDate || item.expiration_date || null;
          existingCreatedAt = item.created_at || now;
        }
      } catch (e) {
        console.warn(`Could not fetch existing item for ${nofoName}:`, e.message);
      }

      const finalExpDate = existingExpDate || applicationDeadline || null;

      const metadataItem = {
        nofo_name: nofoName,
        status: "active",
        isPinned: "false",
        expiration_date: finalExpDate,
        grant_type: existingGrantType,
        agency: existingAgency,
        category: existingCategory,
        created_at: existingCreatedAt,
        updated_at: now,
      };
      if (contentHash) metadataItem.content_hash = contentHash;

      await dynamoClient.send(
        new PutItemCommand({
          TableName: tableName,
          Item: marshall(metadataItem),
        })
      );

      console.log(`Published NOFO metadata to DynamoDB for ${nofoName}`);

      await updateProcessingStatus(nofoName, null);
    } catch (error) {
      console.error(`DynamoDB write failed for ${nofoName}:`, error);
    }
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
