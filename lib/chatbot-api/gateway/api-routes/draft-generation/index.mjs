/**
 * REST API handler for draft generation
 *
 * This module processes POST requests to the /draft-generation endpoint
 * and starts a Step Functions execution to generate draft sections in parallel.
 * Returns a jobId immediately for polling.
 */

import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { DynamoDBClient, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { randomUUID } from "crypto";

const sfnClient = new SFNClient({ region: 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

const SUPPORTED_STATE_CODES = new Set(JSON.parse(process.env.SUPPORTED_STATES || "[]"));

const STATE_NAMES = {
  CA: "California",
  CO: "Colorado",
  RI: "Rhode Island",
};

function parseRoles(raw) {
  if (Array.isArray(raw)) return raw.filter((r) => typeof r === "string");
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((r) => typeof r === "string") : [];
  } catch {
    return [raw];
  }
}

function resolveCallerScope(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
  const roles = parseRoles(claims["custom:role"]);
  const stateRaw = String(claims["custom:state"] || "").trim().toUpperCase();
  const state = SUPPORTED_STATE_CODES.has(stateRaw) ? stateRaw : "";

  if (roles.includes("Developer")) return { role: "developer", state };
  if (roles.includes("Admin")) {
    return state ? { role: "stateAdmin", state } : { role: "regularAdmin", state: "" };
  }
  return { role: "user", state };
}

function assertUserCanAccessNofo(callerScope, nofoScope, nofoState) {
  if (callerScope.role === "developer" || callerScope.role === "regularAdmin") return;
  if (nofoScope === "federal") return;
  if (nofoScope === "state" && nofoState && nofoState === callerScope.state) return;

  const err = new Error("ACCESS_DENIED_STATE");
  err.code = "ACCESS_DENIED_STATE";
  err.statusCode = 403;
  err.userState = callerScope.state || null;
  err.nofoState = nofoState || null;
  throw err;
}

async function readNofoScope(nofoName) {
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

/**
 * Handler for the draft generation API
 *
 * @param {object} event - API Gateway event object
 * @returns {object} - API Gateway response
 */
export const handler = async (event) => {
  try {
    console.log('Event received:', JSON.stringify(event));

    // CORS headers for preflight requests
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'OPTIONS,POST',
      'Content-Type': 'application/json'
    };

    // Handle OPTIONS requests (CORS preflight)
    if (event.requestContext?.http?.method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({})
      };
    }

    // Parse request body
    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch (error) {
      console.error('Error parsing request body:', error);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid request body' })
      };
    }

    const { query, documentIdentifier, projectBasics, questionnaire, sessionId } = body;

    // Validate required parameters
    if (!query || !documentIdentifier || !sessionId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Query, documentIdentifier, and sessionId are required' })
      };
    }

    // Generate a unique job ID for this draft generation
    const jobId = randomUUID();
    console.log(`[Job ${jobId}] Starting draft generation for query: "${query}"`);

    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub
      || event.requestContext?.authorizer?.claims?.sub
      || 'unknown';

    const callerScope = resolveCallerScope(event);
    const nofoScopeRow = await readNofoScope(documentIdentifier);
    const effectiveScope = nofoScopeRow.scope || "federal";
    const effectiveState = nofoScopeRow.state;

    try {
      assertUserCanAccessNofo(callerScope, effectiveScope, effectiveState);
    } catch (authError) {
      if (authError.code === "ACCESS_DENIED_STATE") {
        const stateName = effectiveState ? (STATE_NAMES[effectiveState] || effectiveState) : "another state";
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            error: "ACCESS_DENIED_STATE",
            message: `This grant is specific to ${stateName}. Please contact a platform administrator to request access.`,
            userState: authError.userState,
            nofoState: authError.nofoState,
            cta: { label: "Go back to home", target: "/home" },
          }),
        };
      }
      throw authError;
    }

    const userState = callerScope.state || "";

    // Store initial job status in DynamoDB
    const tableName = process.env.DRAFT_GENERATION_JOBS_TABLE_NAME;
    if (tableName) {
      await saveJobStatus(jobId, {
        jobId,
        status: 'in_progress',
        query,
        documentIdentifier,
        projectBasics: projectBasics || {},
        questionnaire: questionnaire || {},
        sessionId,
        sections: {},
        createdAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 3600 // 1 hour TTL
      });
    }

    // Start the Step Functions execution
    await startDraftGenerationExecution(jobId, {
      jobId,
      query,
      documentIdentifier,
      projectBasics: projectBasics || {},
      questionnaire: questionnaire || {},
      sessionId,
      userId,
      userState,
      nofoScope: effectiveScope,
      nofoState: effectiveState,
    });

    // Return the jobId immediately for polling
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        jobId,
        status: 'in_progress',
        message: 'Draft generation started. Poll /draft-generation-jobs/{jobId} for results.'
      })
    };
  } catch (error) {
    console.error('Error processing draft generation:', error);

    // Return error response
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Failed to generate draft sections',
        message: error.message
      })
    };
  }
};

/**
 * Save job status to DynamoDB
 */
async function saveJobStatus(jobId, jobData) {
  try {
    const tableName = process.env.DRAFT_GENERATION_JOBS_TABLE_NAME;
    if (!tableName) {
      console.warn('DRAFT_GENERATION_JOBS_TABLE_NAME not configured');
      return;
    }

    const command = new PutItemCommand({
      TableName: tableName,
      Item: marshall(jobData)
    });

    await dynamoClient.send(command);
    console.log(`[Job ${jobId}] Saved job status to DynamoDB`);
  } catch (error) {
    console.error(`[Job ${jobId}] Error saving job status:`, error);
    // Don't throw - job can still proceed
  }
}

/**
 * Start the draft generation Step Functions execution
 */
async function startDraftGenerationExecution(jobId, input) {
  const stateMachineArn = process.env.DRAFT_GENERATION_STATE_MACHINE_ARN;
  if (!stateMachineArn) {
    throw new Error('DRAFT_GENERATION_STATE_MACHINE_ARN not configured');
  }

  // Sanitize jobId for the execution name (alphanumeric, hyphens, underscores only)
  const sanitizedJobId = jobId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 40);
  const executionName = `draft-${Date.now()}-${sanitizedJobId}`;

  try {
    const command = new StartExecutionCommand({
      stateMachineArn,
      name: executionName,
      input: JSON.stringify(input),
    });
    await sfnClient.send(command);
    console.log(`[Job ${jobId}] Started Step Functions execution: ${executionName}`);
  } catch (error) {
    console.error(`[Job ${jobId}] Error starting Step Functions execution:`, error);

    // Update job status to error
    const tableName = process.env.DRAFT_GENERATION_JOBS_TABLE_NAME;
    if (tableName) {
      await saveJobStatus(jobId, {
        jobId,
        status: 'error',
        error: error.message,
        completedAt: new Date().toISOString()
      });
    }

    throw error;
  }
}
