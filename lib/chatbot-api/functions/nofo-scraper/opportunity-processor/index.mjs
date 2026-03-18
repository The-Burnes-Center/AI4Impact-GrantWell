/**
 * Opportunity Processor Lambda
 *
 * Triggered by SQS (ScraperDownloadQueue). Each invocation handles exactly
 * one opportunity: fetch details from Simpler.Grants.gov, identify the NOFO
 * attachment (using Bedrock if multiple), download, upload to S3, and write
 * metadata to DynamoDB.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { createHash } from 'crypto';
import {
  normalizeDateToYYYYMMDD,
  normalizeNofoFolderName,
  mapFundingCategory,
  sleep,
  RATE_LIMIT_DELAY,
  CLAUDE_MODEL_ID,
} from '../shared/utils.mjs';

const API_KEY = process.env.GRANTS_GOV_API_KEY;
const S3_BUCKET = process.env.BUCKET;
const METADATA_TABLE = process.env.NOFO_METADATA_TABLE_NAME;

const s3Client = new S3Client({ region: 'us-east-1' });
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function getExistingItem(title) {
  try {
    const result = await dynamoClient.send(
      new GetItemCommand({ TableName: METADATA_TABLE, Key: marshall({ nofo_name: title }) })
    );
    return result.Item ? unmarshall(result.Item) : null;
  } catch {
    return null;
  }
}

async function identifyNOFOFile(attachments) {
  const attachmentInfo = attachments.map((att, index) => ({
    index: index + 1,
    filename: att.download_path ? att.download_path.split('/').pop() : 'unknown',
    description: att.file_description || 'No description available',
    download_path: att.download_path || '',
  }));

  const prompt = `You are analyzing grant opportunity attachments to identify which file is the Notice of Funding Opportunity (NOFO) document.

The NOFO is typically:
- The main funding announcement document
- Contains eligibility requirements, application instructions, and deadlines
- Usually has names like "NOFO", "Funding Opportunity", "Grant Announcement", "RFA" (Request for Applications), "RFP" (Request for Proposals), or similar
- May be a PDF or HTML file
- Usually the primary document, not supplementary materials like forms, FAQs, or appendices

Here are the attachments:
${JSON.stringify(attachmentInfo, null, 2)}

Analyze the filenames and descriptions to identify which attachment is most likely the NOFO file.

Return your response as a JSON object with this exact format:
{
  "nofoIndex": <number between 1 and ${attachments.length}>,
  "reason": "<brief explanation of why this file is the NOFO>"
}

Return ONLY the JSON object, no additional text or explanation.`;

  const nofoIdSchema = {
    type: "object",
    properties: {
      nofoIndex: { type: "number", description: "1-based index of the NOFO attachment" },
      reason: { type: "string", description: "Brief explanation of why this file is the NOFO" },
    },
    required: ["nofoIndex", "reason"],
  };

  const command = new InvokeModelCommand({
    modelId: CLAUDE_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 500,
      temperature: 0,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      tools: [{ name: "identify_nofo", description: "Identify which attachment is the NOFO document", input_schema: nofoIdSchema }],
      tool_choice: { type: "tool", name: "identify_nofo" },
    }),
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const toolBlock = responseBody.content?.find((b) => b.type === "tool_use");

  if (!toolBlock?.input) {
    console.error('Bedrock did not return structured output:', JSON.stringify(responseBody.content));
    return null;
  }

  const result = toolBlock.input;
  if (result.nofoIndex >= 1 && result.nofoIndex <= attachments.length) {
    return { attachment: attachments[result.nofoIndex - 1], reason: result.reason };
  }

  console.error(`Invalid NOFO index ${result.nofoIndex} from Bedrock`);
  return null;
}

async function fetchOpportunityDetails(opportunityId) {
  const response = await fetch(
    `https://api.simpler.grants.gov/v1/opportunities/${opportunityId}`,
    { method: 'GET', headers: { accept: 'application/json', 'X-API-Key': API_KEY } }
  );

  if (!response.ok) {
    throw new Error(`Details API ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const opp = data?.data;
  if (!opp) return null;

  const attachments = (opp.attachments || []).filter((att) => !!att.download_path);

  let selectedAttachment;
  let nofoIdentificationReason = null;
  let isAdditionalInfoUrl = false;

  if (attachments.length === 0) {
    const additionalInfoUrl = opp.summary?.additional_info_url;
    if (!additionalInfoUrl) return null;

    selectedAttachment = {
      download_path: additionalInfoUrl,
      file_description: opp.summary?.additional_info_url_description || 'Additional Information URL',
    };
    nofoIdentificationReason = 'Using additional_info_url (no attachments available)';
    isAdditionalInfoUrl = true;
    console.log(`No attachments for ${opportunityId}, using additional_info_url`);
  } else if (attachments.length === 1) {
    selectedAttachment = attachments[0];
  } else {
    console.log(`Multiple attachments for ${opportunityId}, using Bedrock`);
    const identification = await identifyNOFOFile(attachments);
    if (!identification) {
      console.log(`Could not identify NOFO for ${opportunityId}, skipping`);
      return null;
    }
    selectedAttachment = identification.attachment;
    nofoIdentificationReason = identification.reason;
  }

  const agencyName = opp.agency_name || opp.top_level_agency_name || 'Unknown';
  const fundingCategories = opp.summary?.funding_categories || [];
  let category = null;
  if (fundingCategories.length > 0) {
    category = mapFundingCategory(fundingCategories[0]);
    if (!category) {
      console.log(`Unmappable category "${fundingCategories[0]}" for ${opportunityId}`);
      return null;
    }
  } else {
    console.log(`No funding categories for ${opportunityId}`);
    return null;
  }

  const closeDate = normalizeDateToYYYYMMDD(opp.summary?.close_date);

  return {
    opportunity_id: opp.opportunity_id,
    opportunity_title: opp.opportunity_title,
    download_path: selectedAttachment.download_path,
    file_description: selectedAttachment.file_description || '',
    posted_date: opp.posted_date,
    close_date: closeDate,
    agency_name: agencyName,
    category,
    nofo_identification_reason: nofoIdentificationReason,
    is_additional_info_url: isAdditionalInfoUrl,
    source_updated_at: opp.updated_at || null,
  };
}

async function downloadFile(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed ${response.status}: ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function uploadToS3(key, fileBuffer, contentType) {
  await s3Client.send(
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: fileBuffer, ContentType: contentType })
  );
}

async function writeMetadata(title, details, isUpdate, contentHash) {
  const now = new Date().toISOString();
  const existingItem = await getExistingItem(title);
  const expirationDate = normalizeDateToYYYYMMDD(details.close_date);

  const item = {
    nofo_name: title,
    opportunity_id: details.opportunity_id || null,
    agency: details.agency_name || 'Unknown',
    category: details.category,
    grant_type: existingItem?.grant_type || 'federal',
    status: existingItem?.status || 'active',
    isPinned: existingItem?.isPinned || 'false',
    expiration_date: expirationDate,
    source_updated_at: details.source_updated_at || null,
    content_hash: contentHash || existingItem?.content_hash || null,
    created_at: existingItem?.created_at || now,
    updated_at: now,
  };

  await dynamoClient.send(
    new PutItemCommand({ TableName: METADATA_TABLE, Item: marshall(item) })
  );

  const action = isUpdate ? 'Updated' : 'Created';
  console.log(`${action} metadata for ${title} — Agency: ${details.agency_name}, Category: ${details.category}`);
}

// ---------------------------------------------------------------------------
// SQS Handler (batchSize 1, reportBatchItemFailures)
// ---------------------------------------------------------------------------

export const handler = async (event) => {
  const batchItemFailures = [];

  for (const record of event.Records) {
    const { messageId } = record;
    try {
      const { opportunityId, opportunityTitle, isUpdate, apiUpdatedAt } = JSON.parse(record.body);
      const action = isUpdate ? 'Updating' : 'Processing new';
      console.log(`${action} opportunity ${opportunityId}: ${opportunityTitle}`);

      const details = await fetchOpportunityDetails(opportunityId);
      if (!details) {
        console.log(`Skipping ${opportunityId} — no eligible attachment`);
        continue;
      }

      await sleep(RATE_LIMIT_DELAY);

      const fileBuffer = await downloadFile(details.download_path);

      let extension;
      if (details.is_additional_info_url) {
        extension = 'html';
      } else {
        const urlParts = details.download_path.split('.');
        extension = urlParts[urlParts.length - 1].toLowerCase();
      }

      if (extension !== 'pdf' && extension !== 'html') {
        console.log(`Unsupported file type "${extension}" for ${opportunityTitle}`);
        continue;
      }

      const folderName = normalizeNofoFolderName(details.opportunity_title);

      // Compare file hash against stored hash to skip unchanged content
      const newHash = sha256(fileBuffer);
      const existingItem = await getExistingItem(folderName);
      const storedHash = existingItem?.content_hash || null;
      const contentChanged = newHash !== storedHash;
      let s3Key;
      let contentType;

      if (extension === 'html') {
        s3Key = `pending-conversion/${folderName}/NOFO-File-HTML.html`;
        contentType = 'text/html';
      } else {
        s3Key = `${folderName}/NOFO-File-PDF`;
        contentType = 'application/pdf';
      }

      if (contentChanged) {
        await uploadToS3(s3Key, fileBuffer, contentType);
        console.log(`Uploaded ${s3Key} (hash: ${newHash.substring(0, 12)}…)`);
      } else {
        console.log(
          `Content unchanged for "${opportunityTitle}" (hash: ${newHash.substring(0, 12)}…), skipping S3 upload`
        );
      }

      // Always update metadata (agency, expiration, source_updated_at may have changed)
      if (details.category) {
        await writeMetadata(folderName, details, isUpdate, newHash);
      }

      console.log(`Completed ${opportunityId}${contentChanged ? '' : ' (metadata only)'}`);
    } catch (err) {
      console.error(`Failed to process SQS message ${messageId}:`, err);
      batchItemFailures.push({ itemIdentifier: messageId });
    }
  }

  return { batchItemFailures };
};
