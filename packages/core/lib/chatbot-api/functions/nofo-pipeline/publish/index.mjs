import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { updateProcessingStatus } from "../shared/status.mjs";
import { hasQuestions } from "../shared/questions.mjs";
import { artifactsBucket, grantDeadline, isMissingObject, isPendingKey, putArtifact, readArtifactText, withSectionIds } from "grantwell-shared";
import { CITATIONS_FILE, itemsHash, requirementItems } from "../shared/cite.mjs";
import { finishSwap, rollBack, swapIn } from "../shared/swap.mjs";

// scope/state are written by upload-nofos / scraper; publish reads them so
// the late-stage sidecar overwrite doesn't drop these fields.
async function readScopeFromMetadataTable(nofoName) {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (!tableName || !nofoName) return { scope: null, state: null, status: null, previousStatus: null };
  try {
    const result = await dynamoClient.send(
      new GetItemCommand({
        TableName: tableName,
        Key: marshall({ nofo_name: nofoName }),
      })
    );
    if (!result.Item) return { scope: null, state: null, status: null, previousStatus: null };
    const row = unmarshall(result.Item);
    return {
      scope: typeof row.scope === "string" ? row.scope : null,
      state: typeof row.state === "string" ? row.state : null,
      status: typeof row.status === "string" ? row.status : null,
      previousStatus: typeof row.previous_status === "string" ? row.previous_status : null,
      isRolling: row.is_rolling,
      expirationDate: typeof row.expiration_date === "string" ? row.expiration_date : null,
    };
  } catch (err) {
    console.warn(`Could not read scope/state for ${nofoName}:`, err.message);
    return { scope: null, state: null, status: null, previousStatus: null };
  }
}

/**
 * A live grant keeps its status when its new version publishes, and a held grant goes back to the
 * status it had before it was held, except that an archived one opens again when the deadline
 * it publishes with is still ahead. Anything else goes live as active.
 */
export function statusToPublish(publishStatus, { status, previousStatus, isRolling }, expirationDate, now = new Date()) {
  const archived =
    publishStatus === "archived" || status === "archived" || (status !== "active" && previousStatus === "archived");
  if (!archived) return "active";
  const { urgency } = grantDeadline({ expiration_date: expirationDate, is_rolling: isRolling }, now);
  return urgency && urgency !== "expired" ? "active" : "archived";
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
    adminGuidance,
    reviewApproval,
    publishStatus,
  } = event;

  if (!mergedSummary || typeof mergedSummary !== "object") {
    throw new Error(
      `Refusing to publish "${nofoName}": extracted requirements are empty. Duplicate/failed reviews have no extracted data — reprocess the grant instead.`
    );
  }

  if (!hasQuestions(questionsData)) {
    throw new Error(
      `Refusing to publish "${nofoName}": no application questions. Reprocess the grant to regenerate them.`
    );
  }

  const bucket = s3Bucket || process.env.BUCKET;
  const folderPath = nofoName + "/";

  // Apply any admin corrections to the summary
  let finalSummary = mergedSummary;
  if (corrections) {
    finalSummary = { ...mergedSummary, ...corrections };
  }
  if (Array.isArray(finalSummary.ProjectNarrativeSections)) {
    finalSummary = {
      ...finalSummary,
      ProjectNarrativeSections: withSectionIds(finalSummary.ProjectNarrativeSections),
    };
  }

  // A staged version is swapped in here; until then the published files stay as they were.
  const staged = isPendingKey(documentKey);
  const grantBucket = staged ? process.env.BUCKET : bucket;
  try {
    const docKey = staged ? await swapIn(nofoName, documentKey, grantBucket) : documentKey || `${nofoName}/NOFO-File-PDF`;

    await uploadJson(artifactsBucket(), `${folderPath}summary.json`, finalSummary);

    await uploadJson(artifactsBucket(), `${folderPath}questions.json`, questionsData);

    if (reviewApproval) await recordApproval(nofoName, finalSummary, reviewApproval);

    const metadataRow = await readScopeFromMetadataTable(nofoName);
    const { scope: ddbScope, state: ddbState } = metadataRow;

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

    await uploadJson(grantBucket, `${docKey}.metadata.json`, metadata);

    // Write to DynamoDB — use UpdateItem to preserve admin-edited fields
    // (grant_type, isPinned, created_at). Errors propagate so Step Functions
    // can retry instead of silently claiming success.
    const tableName = process.env.NOFO_METADATA_TABLE_NAME;
    if (tableName) {
      const now = new Date().toISOString();
      const finalExpDate = existingExpirationDate || corrections?.application_deadline || applicationDeadline || null;

      // Build SET expressions: always update these fields
      const setExprs = [
        "#status = :status",
        "updated_at = :now",
        // Terminal stamp so the Processing tab can keep showing this grant as "Published" for a
        // window after it finishes (see retrieve-nofos), instead of it vanishing the instant
        // processing_status clears. `published` here means it went live (possibly review-flagged).
        "processing_completed_at = :now",
        "processing_outcome = :outcome",
      ];
      const exprNames = { "#status": "status" };
      const exprValues = {
        ":status": statusToPublish(publishStatus, metadataRow, finalExpDate || metadataRow.expirationDate),
        ":now": now,
        ":outcome": "published",
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

      const removeFields = ["pipeline_claim_at", "pipeline_claim_execution", "previous_status"];
      if (adminGuidance) {
        setExprs.push("review_flag = :reviewFlag");
        exprValues[":reviewFlag"] = {
          reason: adminGuidance.reason,
          missingCategories: adminGuidance.missingCategories || [],
          ...(adminGuidance.missingParts && { missingParts: adminGuidance.missingParts }),
          flaggedAt: now,
        };
      } else {
        removeFields.push("review_flag");
      }
      const removeExpr = ` REMOVE ${removeFields.join(", ")}`;

      await dynamoClient.send(
        new UpdateItemCommand({
          TableName: tableName,
          Key: marshall({ nofo_name: nofoName }),
          UpdateExpression: `SET ${setExprs.join(", ")}${removeExpr}`,
          ExpressionAttributeNames: exprNames,
          ExpressionAttributeValues: marshall(exprValues),
        })
      );

      console.log(`Published NOFO metadata to DynamoDB for ${nofoName}`);
      await updateProcessingStatus(nofoName, null);
    }
  } catch (error) {
    if (staged) {
      try {
        await rollBack(nofoName);
      } catch (rollbackError) {
        console.error(`Could not restore the published version of ${nofoName}; its swap journal stays for the next attempt:`, rollbackError);
      }
    }
    throw error;
  }
  if (staged) await finishSwap(nofoName);

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

  const citeFunctionName = process.env.CITE_REQUIREMENTS_FUNCTION_NAME;
  if (citeFunctionName) {
    try {
      await lambdaClient.send(
        new InvokeCommand({ FunctionName: citeFunctionName, InvocationType: "Event", Payload: JSON.stringify({ nofoName }) })
      );
    } catch (error) {
      console.error("Failed to start requirement citations (the nightly run will retry):", error);
    }
  }

  console.log(`Published NOFO ${nofoName} successfully`);

  return {
    statusCode: 200,
    nofoName,
    published: true,
  };
};

/**
 * An admin approved these exact items after review, so the live-grant check does not flag them
 * again until they change. Kept in requirements-citations.json, which cite-requirements carries it
 * across when it rewrites the file.
 */
async function recordApproval(nofoName, summary, { reviewId = null, by = null, at = new Date().toISOString() }) {
  const key = `${nofoName}/${CITATIONS_FILE}`;
  try {
    let file = null;
    try {
      file = JSON.parse(await readArtifactText(s3Client, key));
    } catch (error) {
      if (!isMissingObject(error) && !(error instanceof SyntaxError)) throw error;
    }
    file = file && typeof file === "object" ? file : { items: {} };
    file.approval = {
      at,
      by,
      reviewId,
      itemsHash: itemsHash(requirementItems(summary)),
      applicationDeadline: summary?.application_deadline || null,
    };
    await putArtifact(s3Client, key, JSON.stringify(file), "application/json");
  } catch (error) {
    console.error(`Could not record the review approval for ${nofoName}; a later live check may flag it again:`, error);
  }
}

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
