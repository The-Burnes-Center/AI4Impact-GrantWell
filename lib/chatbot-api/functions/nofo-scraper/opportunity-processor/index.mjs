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

  const prompt = `Identify which attachment is the NOFO (Notice of Funding Opportunity) — 
  the main funding announcement containing eligibility, instructions, and deadlines. 
  Look for filenames containing "NOFO", "Funding Opportunity", "RFA", "RFP", or similar. 
  Exclude supplementary materials (forms, FAQs, appendices).

Attachments:
${JSON.stringify(attachmentInfo, null, 2)}

Return nofoIndex (1-${attachments.length}) and a brief reason.`;

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

const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function downloadFile(url) {
  const response = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } });
  if (!response.ok) {
    if (response.status === 404 || response.status === 410) {
      return null;
    }
    throw new Error(`Download failed ${response.status}: ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || '';
  return { buffer, contentType, finalUrl: response.url || url };
}

function sniffKind(buffer, contentType) {
  if (buffer.length >= 4 && buffer.slice(0, 4).toString('ascii') === '%PDF') return 'pdf';
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('pdf')) return 'pdf';
  const head = buffer.slice(0, 512).toString('utf8').trimStart().toLowerCase();
  if (ct.includes('html') || head.startsWith('<!doctype html') || head.startsWith('<html')) return 'html';
  return 'other';
}

function htmlToText(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, ' ')
    .trim();
}

const GRANT_KEYWORDS = [
  'grant', 'funding', 'applicant', 'eligib', 'award', 'nofo', 'notice',
  'opportunity', 'program', 'federal', 'application', 'deadline', 'narrative', 'budget',
];
function isNofoContent(text) {
  if (!text || text.length < 500) return false;
  const sampleSize = 5000;
  const mid = Math.floor(text.length / 2);
  const sample = (text.substring(0, sampleSize) + text.substring(mid, mid + sampleSize)).toLowerCase();
  const matches = GRANT_KEYWORDS.filter((kw) => sample.includes(kw)).length;
  return matches >= 2;
}

function sameTldOrHost(candidateUrl, baseUrl) {
  try {
    const c = new URL(candidateUrl);
    const b = new URL(baseUrl);
    if (c.host === b.host) return true;
    const cTld = c.hostname.split('.').slice(-2).join('.');
    const bTld = b.hostname.split('.').slice(-2).join('.');
    return cTld === bTld;
  } catch {
    return false;
  }
}

function findPdfCandidates(html, baseUrl) {
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const docPathRe = /\.pdf(?:[?#]|$)|viewrepositorydocument|download=1|\/download\//i;
  const docLabelRe = /\b(nofo|notice of funding|solicitation|announcement|full\s+text|opportunity\s+document|rfa|rfp)\b/i;

  const seen = new Set();
  const candidates = [];
  let m;
  while ((m = anchorRe.exec(html)) !== null) {
    const rawHref = m[1].trim();
    const label = htmlToText(m[2]).slice(0, 200);
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) continue;

    let absolute;
    try {
      absolute = new URL(rawHref, baseUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(absolute)) continue;
    if (!sameTldOrHost(absolute, baseUrl)) continue;

    const strong = docPathRe.test(absolute);
    const weak = docLabelRe.test(label);
    if (!strong && !weak) continue;

    seen.add(absolute);
    candidates.push({ url: absolute, label: label || absolute.split('/').pop(), strong });
  }
  return candidates;
}

async function resolveNofoDocument(url, opportunityTitle, followDepth = 1) {
  const downloaded = await downloadFile(url);
  if (!downloaded) return null;
  const { buffer, contentType, finalUrl } = downloaded;
  const kind = sniffKind(buffer, contentType);

  if (kind === 'pdf') return { kind: 'pdf', buffer, url: finalUrl };
  if (kind !== 'html') return { kind: 'other', buffer, url: finalUrl };

  const htmlStr = buffer.toString('utf8');
  const text = htmlToText(htmlStr);
  const candidates = followDepth > 0 ? findPdfCandidates(htmlStr, finalUrl) : [];
  const strong = candidates.filter((c) => c.strong);
  const textIsNofo = isNofoContent(text);

  const fallback = textIsNofo
    ? { kind: 'html_text', buffer: Buffer.from(text, 'utf8'), url: finalUrl }
    : { kind: 'html_raw', buffer, url: finalUrl };

  const pool = strong.length > 0 ? strong : (textIsNofo ? [] : candidates);
  if (pool.length === 0) return fallback;

  let chosen;
  if (pool.length === 1) {
    chosen = pool[0];
  } else {
    const identification = await identifyNOFOFile(
      pool.map((c) => ({ download_path: c.url, file_description: c.label }))
    );
    chosen = identification?.attachment
      ? { url: identification.attachment.download_path, label: identification.attachment.file_description }
      : pool[0];
  }

  console.log(`Following link from ${finalUrl} → ${chosen.url} (label: "${chosen.label}")`);
  const followed = await resolveNofoDocument(chosen.url, opportunityTitle, followDepth - 1);
  if (!followed || followed.kind === 'html_raw' || followed.kind === 'other') {
    return fallback;
  }
  return { ...followed, followedFrom: finalUrl };
}

async function uploadToS3(key, fileBuffer, contentType) {
  await s3Client.send(
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: fileBuffer, ContentType: contentType })
  );
}

// Bedrock KB picks up custom metadata from `<source>.metadata.json` sidecars.
// Scraper-produced NOFOs are always federal, so `scope` is hardcoded.
async function writeFederalScopeSidecar(sourceKey) {
  const sidecarKey = `${sourceKey}.metadata.json`;
  const body = JSON.stringify({ metadataAttributes: { scope: "federal" } });
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: sidecarKey,
      Body: body,
      ContentType: "application/json",
    })
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
    scope: 'federal',
    state: null,
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

      const resolved = await resolveNofoDocument(details.download_path, details.opportunity_title, 1);
      if (!resolved) {
        console.log(`Skipping ${opportunityId} — download URL returned 404/410 (dead link)`);
        continue;
      }

      if (resolved.kind === 'other') {
        console.log(`Unsupported content type for ${opportunityTitle} at ${resolved.url}`);
        continue;
      }

      const folderName = normalizeNofoFolderName(details.opportunity_title);

      const newHash = sha256(resolved.buffer);
      const existingItem = await getExistingItem(folderName);
      const storedHash = existingItem?.content_hash || null;
      const contentChanged = newHash !== storedHash;
      let s3Key;
      let contentType;

      if (resolved.kind === 'pdf') {
        s3Key = `${folderName}/NOFO-File-PDF`;
        contentType = 'application/pdf';
      } else if (resolved.kind === 'html_text') {
        s3Key = `${folderName}/NOFO-File-TXT`;
        contentType = 'text/plain; charset=utf-8';
      } else {
        s3Key = `pending-conversion/${folderName}/NOFO-File-HTML.html`;
        contentType = 'text/html';
      }

      if (contentChanged) {
        await uploadToS3(s3Key, resolved.buffer, contentType);
        // KB metadata sidecar: federal scope for scraper-produced NOFOs. Only
        // write for KB-indexed kinds (pdf, html_text); pending-conversion HTML
        // lives under a different prefix and will get its sidecar on conversion.
        if (resolved.kind === "pdf" || resolved.kind === "html_text") {
          await writeFederalScopeSidecar(s3Key);
        }
        const followNote = resolved.followedFrom ? ` (followed from ${resolved.followedFrom})` : '';
        console.log(`Uploaded ${s3Key} (hash: ${newHash.substring(0, 12)}…, kind: ${resolved.kind})${followNote}`);
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
