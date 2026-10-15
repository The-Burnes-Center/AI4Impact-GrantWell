/**
 * Removes what a user stored, ahead of deleting their account: chats, applications and their
 * version history, supporting documents (every version and delete marker under the user's folder,
 * knowledge-base sidecars included), the profile row, notification preferences, and the typed query
 * on each search event. Usage events themselves stay so the dashboard's counts don't change.
 * Each step re-reads what is left, so a retry after a partial failure finishes the job.
 *
 * Env: CHAT_HISTORY_TABLE_NAME, DRAFT_TABLE_NAME, DRAFT_VERSION_TABLE_NAME, ANALYTICS_TABLE_NAME,
 * USER_NOTIFICATION_PREFS_TABLE_NAME, USER_DOCUMENTS_BUCKET, SYNC_KB_FUNCTION_NAME
 */

import {
  BatchWriteItemCommand,
  DeleteItemCommand,
  DynamoDBClient,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { DeleteObjectsCommand, ListObjectVersionsCommand, S3Client } from "@aws-sdk/client-s3";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const region = process.env.AWS_REGION || "us-east-1";
const dynamo = new DynamoDBClient({ region });
const s3 = new S3Client({ region });
const lambda = new LambdaClient({ region });

const BATCH_SIZE = 25;
// A chat's turns are rows of their own next to it, keyed "<session_id>#turn#<n>".
const CHAT_TURN_MARKER = "#turn#";
const MAX_BATCH_ATTEMPTS = 5;

function config() {
  const env = {
    chats: process.env.CHAT_HISTORY_TABLE_NAME,
    drafts: process.env.DRAFT_TABLE_NAME,
    draftVersions: process.env.DRAFT_VERSION_TABLE_NAME,
    analytics: process.env.ANALYTICS_TABLE_NAME,
    notificationPrefs: process.env.USER_NOTIFICATION_PREFS_TABLE_NAME,
    bucket: process.env.USER_DOCUMENTS_BUCKET,
    syncFunction: process.env.SYNC_KB_FUNCTION_NAME,
  };
  const missing = Object.entries(env).filter(([, value]) => !value);
  if (missing.length) {
    const error = new Error("User data cleanup is not configured");
    error.statusCode = 500;
    throw error;
  }
  return env;
}

/**
 * Delete everything stored for the user. `sub` keys the tables; `username` is the
 * supporting-documents folder. Throws if any store could not be cleared.
 */
export async function deleteUserData({ sub, username }) {
  if (!sub || !username || username.includes("/")) {
    throw new Error("Cannot resolve the user's data keys");
  }
  const env = config();

  const steps = await Promise.allSettled([
    deleteChats(env, sub),
    deleteApplications(env, sub),
    deleteDocuments(env, username),
    deleteProfile(env, sub),
    deleteNotificationPrefs(env, sub),
  ]);
  const failed = steps.filter((step) => step.status === "rejected");
  if (failed.length) {
    for (const step of failed) console.error("User data cleanup step failed:", step.reason);
    const error = new Error(
      "Some of this user's data could not be deleted, so the account was kept. Try again."
    );
    error.statusCode = 502;
    throw error;
  }

  const [chats, applications, documents, profile, notificationPreferences] = steps.map((s) => s.value);
  return {
    chats,
    applications: applications.drafts,
    applicationVersions: applications.versions,
    supportingDocuments: documents,
    profile: profile.profile,
    searchTextsErased: profile.searchTextsErased,
    notificationPreferences,
  };
}

async function* queryPages(params) {
  let ExclusiveStartKey;
  do {
    const page = await dynamo.send(new QueryCommand({ ...params, ExclusiveStartKey }));
    yield (page.Items || []).map((item) => unmarshall(item));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}

async function batchDelete(table, keys) {
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    let pending = keys.slice(i, i + BATCH_SIZE).map((key) => ({ DeleteRequest: { Key: marshall(key) } }));
    for (let attempt = 1; pending.length; attempt += 1) {
      if (attempt > MAX_BATCH_ATTEMPTS) {
        throw new Error(`${pending.length} rows in ${table} were not deleted`);
      }
      if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
      const result = await dynamo.send(new BatchWriteItemCommand({ RequestItems: { [table]: pending } }));
      pending = result.UnprocessedItems?.[table] || [];
    }
  }
}

async function deleteChats(env, sub) {
  let count = 0;
  for await (const items of queryPages({
    TableName: env.chats,
    KeyConditionExpression: "user_id = :u",
    ExpressionAttributeValues: marshall({ ":u": sub }),
    ProjectionExpression: "user_id, session_id",
  })) {
    await batchDelete(env.chats, items.map(({ user_id, session_id }) => ({ user_id, session_id })));
    count += items.filter(({ session_id }) => !session_id.includes(CHAT_TURN_MARKER)).length;
  }
  return count;
}

// Versions go before their draft: the version table is only reachable through the draft's key.
async function deleteApplications(env, sub) {
  let drafts = 0;
  let versions = 0;
  for await (const items of queryPages({
    TableName: env.drafts,
    KeyConditionExpression: "user_id = :u",
    ExpressionAttributeValues: marshall({ ":u": sub }),
    ProjectionExpression: "user_id, session_id",
  })) {
    for (const draft of items) {
      for await (const rows of queryPages({
        TableName: env.draftVersions,
        KeyConditionExpression: "draft_key = :k",
        ExpressionAttributeValues: marshall({ ":k": `${sub}#${draft.session_id}` }),
        ProjectionExpression: "draft_key, #r",
        ExpressionAttributeNames: { "#r": "rev" },
      })) {
        await batchDelete(env.draftVersions, rows.map(({ draft_key, rev }) => ({ draft_key, rev })));
        versions += rows.length;
      }
    }
    await batchDelete(env.drafts, items.map(({ user_id, session_id }) => ({ user_id, session_id })));
    drafts += items.length;
  }
  return { drafts, versions };
}

// Listing restarts from the top each round: deleted versions are gone for good, and a version
// marker that names a deleted version is not a safe place to resume from.
async function deleteDocuments(env, username) {
  const documents = new Set();
  for (;;) {
    const page = await s3.send(
      new ListObjectVersionsCommand({ Bucket: env.bucket, Prefix: `${username}/` })
    );
    const objects = [...(page.Versions || []), ...(page.DeleteMarkers || [])].map(({ Key, VersionId }) => ({
      Key,
      VersionId,
    }));
    if (!objects.length) break;

    const result = await s3.send(
      new DeleteObjectsCommand({ Bucket: env.bucket, Delete: { Objects: objects, Quiet: true } })
    );
    if (result.Errors?.length) {
      const first = result.Errors[0];
      throw new Error(`${result.Errors.length} document versions were not deleted (${first.Code}: ${first.Key})`);
    }
    for (const { Key } of objects) {
      if (!Key.endsWith(".metadata.json")) documents.add(Key);
    }
  }

  if (documents.size) {
    try {
      await lambda.send(
        new InvokeCommand({
          FunctionName: env.syncFunction,
          InvocationType: "Event",
          Payload: JSON.stringify({ syncSource: "user-documents" }),
        })
      );
    } catch (error) {
      console.warn("KB sync trigger failed (non-critical):", error?.message);
    }
  }
  return documents.size;
}

async function deleteProfile(env, sub) {
  let profile = false;
  let searchTextsErased = 0;
  for await (const items of queryPages({
    TableName: env.analytics,
    KeyConditionExpression: "pk = :pk",
    FilterExpression: "sk = :profile OR attribute_exists(query_text)",
    ExpressionAttributeValues: marshall({ ":pk": `USER#${sub}`, ":profile": "PROFILE" }),
    ProjectionExpression: "pk, sk",
  })) {
    const searches = items.filter((item) => item.sk !== "PROFILE");
    for (let i = 0; i < searches.length; i += BATCH_SIZE) {
      const erased = await Promise.all(searches.slice(i, i + BATCH_SIZE).map((key) => eraseQueryText(env, key)));
      searchTextsErased += erased.filter(Boolean).length;
    }
    if (searches.length < items.length) {
      await dynamo.send(
        new DeleteItemCommand({ TableName: env.analytics, Key: marshall({ pk: `USER#${sub}`, sk: "PROFILE" }) })
      );
      profile = true;
    }
  }
  return { profile, searchTextsErased };
}

// The condition keeps an event that expired since the query from coming back as a bare key.
async function eraseQueryText(env, { pk, sk }) {
  try {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: env.analytics,
        Key: marshall({ pk, sk }),
        UpdateExpression: "REMOVE query_text",
        ConditionExpression: "attribute_exists(pk)",
      })
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

async function deleteNotificationPrefs(env, sub) {
  const result = await dynamo.send(
    new DeleteItemCommand({
      TableName: env.notificationPrefs,
      Key: marshall({ user_id: sub }),
      ReturnValues: "ALL_OLD",
    })
  );
  return Boolean(result.Attributes);
}
