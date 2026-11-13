import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import {
  getArtifact,
  GRANT_IN_REVIEW_MESSAGE,
  IN_REVIEW_STATUSES,
  opensGrantInReview,
  isMissingObject,
  recordEvent,
  touchLastActive,
  withRequirementCitations,
  withSectionIds,
  REQUIREMENT_CITATIONS_FILE,
  canViewGrant,
  effectiveGrantScope,
  grantViewerScope,
  readGrantRow,
  stateNameFromCode,
} from 'grantwell-shared';

/**
 * A state's guidance overlay on a federal NOFO, if one exists for `stateCode`. Returns the
 * note text or null. Failures are swallowed — an overlay lookup must never block the summary.
 */
async function readStateOverlay(tableName, nofoName, stateCode) {
  if (!tableName || !nofoName || !stateCode) return null;
  try {
    const dynamoClient = new DynamoDBClient();
    const result = await dynamoClient.send(
      new GetItemCommand({
        TableName: tableName,
        Key: marshall({ nofo_name: nofoName, state: stateCode }),
      })
    );
    if (!result.Item) return null;
    const row = unmarshall(result.Item);
    const note = typeof row.note === "string" ? row.note.trim() : "";
    return note ? { note, updatedAt: row.updated_at || null } : null;
  } catch (err) {
    console.warn(`Could not read state overlay for ${nofoName}/${stateCode}:`, err.message);
    return null;
  }
}

const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

export const handler = async (event) => {
  const s3Bucket = process.env.BUCKET;
  const s3Client = new S3Client();

  try {
    const baseFileName = event.queryStringParameters?.documentKey;
    if (!baseFileName) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: "Missing 'documentKey' in query params" }),
      };
    }

    const basePath = baseFileName.split('/')[0];

    const existingScope = await readGrantRow(process.env.NOFO_METADATA_TABLE_NAME, basePath);
    const effectiveScope = effectiveGrantScope(existingScope);
    const effectiveState = existingScope?.state || null;

    const callerScope = grantViewerScope(event);
    if (!canViewGrant(callerScope, existingScope)) {
      const stateName = effectiveState ? stateNameFromCode(effectiveState) : "another state";
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "ACCESS_DENIED_STATE",
          message: existingScope
            ? `This grant is specific to ${stateName}. Please contact a platform administrator to request access.`
            : "We couldn't confirm your access to this grant. Please contact a platform administrator to request access.",
          userState: callerScope.state || null,
          nofoState: effectiveState,
          cta: { label: "Go back to home", target: "/home" },
        }),
      };
    }

    const inReview =
      IN_REVIEW_STATUSES.has(existingScope?.status) && !opensGrantInReview(callerScope, effectiveScope, effectiveState);
    // The applicant's own application stays editable while its grant is reviewed, so the editor
    // still gets the grant's name and narrative section names; nothing else is served.
    const forApplication = event.queryStringParameters?.for === "application";
    if (inReview && !forApplication) {
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "GRANT_IN_REVIEW",
          message: GRANT_IN_REVIEW_MESSAGE,
          cta: { label: "Go to home", target: "/home" },
        }),
      };
    }
    if (inReview) {
      const held = JSON.parse(await streamToString((await getArtifact(s3Client, `${basePath}/summary.json`, s3Bucket)).Body));
      const sections = Array.isArray(held.ProjectNarrativeSections)
        ? withSectionIds(held.ProjectNarrativeSections).map(({ item, id }) => ({ item, id }))
        : [];
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          message: "File retrieved successfully",
          inReview: true,
          data: { GrantName: held.GrantName, ProjectNarrativeSections: sections },
        }),
      };
    }

    const [result, citationsFile] = await Promise.all([
      getArtifact(s3Client, `${basePath}/summary.json`, s3Bucket),
      event.queryStringParameters?.citations === "1" ? readCitations(s3Client, basePath) : null,
    ]);
    const fileContent = await streamToString(result.Body);
    const summary = withRequirementCitations(JSON.parse(fileContent), citationsFile);
    // Summaries written before section ids existed derive the same ids on every read.
    if (Array.isArray(summary.ProjectNarrativeSections)) {
      summary.ProjectNarrativeSections = withSectionIds(summary.ProjectNarrativeSections);
    }

    // A successful summary fetch is a user opening this grant — count it as a view. Best-effort.
    const viewerSub = event?.requestContext?.authorizer?.jwt?.claims?.sub;
    if (viewerSub) {
      await recordEvent({ eventType: "nofo_view", userId: viewerSub, state: callerScope.state, nofoName: basePath });
      await touchLastActive(viewerSub, callerScope.state);
    }

    // On a federal NOFO, merge in the viewer's own state's guidance overlay (if any). The
    // federal record is untouched; other states and stateless viewers see no overlay.
    if (effectiveScope === "federal" && callerScope.state) {
      const overlay = await readStateOverlay(
        process.env.NOFO_STATE_OVERLAY_TABLE_NAME, basePath, callerScope.state
      );
      if (overlay) {
        summary.stateGuidance = {
          state: callerScope.state,
          stateName: stateNameFromCode(callerScope.state),
          note: overlay.note,
          updatedAt: overlay.updatedAt,
        };
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: "File retrieved successfully",
        data: summary,
      }),
    };

  } catch (error) {
    console.error("Error fetching file from S3:", error);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Failed to retrieve file from S3. Internal Server Error.',
      }),
    };
  }
};

/** The grant's requirement citations, or null; the page works without them. */
async function readCitations(s3Client, basePath) {
  try {
    const result = await getArtifact(s3Client, `${basePath}/${REQUIREMENT_CITATIONS_FILE}`, null);
    return JSON.parse(await streamToString(result.Body));
  } catch (error) {
    if (!isMissingObject(error)) console.warn(`Could not read requirement citations for ${basePath}:`, error.message);
    return null;
  }
}

const streamToString = (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
};
