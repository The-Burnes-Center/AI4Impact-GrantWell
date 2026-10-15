/**
 * Opportunity Processor Lambda
 *
 * Triggered by SQS (ScraperDownloadQueue). Each invocation handles exactly
 * one opportunity: fetch details from Simpler.Grants.gov, identify the NOFO
 * attachment (using Bedrock if multiple), download, write metadata to
 * DynamoDB, then upload to S3.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
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

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });

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
      nofoIndex: { type: "integer", description: "1-based index of the NOFO attachment" },
      reason: { type: "string", description: "Brief explanation of why this file is the NOFO" },
    },
    required: ["nofoIndex", "reason"],
    additionalProperties: false,
  };

  const command = new InvokeModelCommand({
    modelId: CLAUDE_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 2500,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: nofoIdSchema },
      },
    }),
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  if (responseBody.stop_reason === 'refusal') {
    console.warn(`Bedrock declined to identify the NOFO (refusal category=${responseBody.stop_details?.category ?? 'unknown'})`);
    return null;
  }
  if (responseBody.stop_reason === 'max_tokens') {
    console.error(`Bedrock NOFO identification truncated at max_tokens (output_tokens=${responseBody.usage?.output_tokens})`);
    return null;
  }
  const textBlock = responseBody.content?.find((b) => b.type === 'text');
  let result;
  try {
    result = JSON.parse(textBlock?.text);
  } catch {
    console.error('Bedrock did not return structured output:', JSON.stringify(responseBody.content));
    return null;
  }

  if (result.nofoIndex >= 1 && result.nofoIndex <= attachments.length) {
    return { attachment: attachments[result.nofoIndex - 1], reason: result.reason };
  }

  console.error(`Invalid NOFO index ${result.nofoIndex} from Bedrock`);
  return null;
}

const STALE_WITHOUT_CLOSE_DATE_YEARS = 3;
const MAX_CLOSE_DATE_YEARS_AHEAD = 10;
const OJP_OFFICES = new Set(['BJA', 'BJS', 'NIJ', 'OJJDP', 'OVC', 'SMART', 'OJP']);

/** Agencies type bare hosts ("www.bja.ojp.gov") into additional_info_url. */
function normalizeUrl(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}

/** OJP lists only its homepage on grants.gov, but every solicitation lives at a URL built from the number. */
function knownAgencyNofoUrl(opportunityNumber) {
  const m = /^O-([A-Z]+)-(\d{4})-(\d+)$/.exec((opportunityNumber || '').trim());
  if (!m || !OJP_OFFICES.has(m[1])) return null;
  return `https://www.ojp.gov/funding/docs/${m[1].toLowerCase()}-${m[2]}-${m[3]}.pdf`;
}

/** grants.gov keeps some long-closed opportunities "posted" with no close date (e.g. a 2018 NASA NRA). */
function isStaleWithoutCloseDate(opp, now = new Date()) {
  if (opp.summary?.close_date) return false;
  const posted = Date.parse(opp.summary?.post_date || opp.posted_date || '');
  if (Number.isNaN(posted)) return false;
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - STALE_WITHOUT_CLOSE_DATE_YEARS);
  return posted < cutoff.getTime();
}

/** Placeholder close dates like 2076-09-01 mean "no deadline", not a real one. */
function plausibleCloseDate(yyyymmdd, now = new Date()) {
  if (!yyyymmdd) return null;
  const year = Number(yyyymmdd.slice(0, 4));
  return year > now.getUTCFullYear() + MAX_CLOSE_DATE_YEARS_AHEAD ? null : yyyymmdd;
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

  if (isStaleWithoutCloseDate(opp)) {
    console.log(`Skipping ${opportunityId} — no close date and posted ${opp.summary?.post_date || opp.posted_date}`);
    return null;
  }

  const attachments = (opp.attachments || []).filter((att) => !!att.download_path);

  let selectedAttachment;
  let nofoIdentificationReason = null;
  let isAdditionalInfoUrl = false;
  let downloadPaths;

  if (attachments.length === 0) {
    const additionalInfoUrl = normalizeUrl(opp.summary?.additional_info_url);
    const agencyUrl = knownAgencyNofoUrl(opp.opportunity_number);
    if (!additionalInfoUrl && !agencyUrl) return null;

    selectedAttachment = {
      download_path: agencyUrl || additionalInfoUrl,
      file_description: opp.summary?.additional_info_url_description || 'Additional Information URL',
    };
    downloadPaths = [agencyUrl, additionalInfoUrl].filter(Boolean);
    nofoIdentificationReason = 'Using additional_info_url (no attachments available)';
    isAdditionalInfoUrl = true;
    console.log(`No attachments for ${opportunityId}, trying ${downloadPaths.join(' then ')}`);
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

  const closeDate = plausibleCloseDate(normalizeDateToYYYYMMDD(opp.summary?.close_date));

  return {
    opportunity_id: opp.opportunity_id,
    opportunity_title: opp.opportunity_title,
    download_path: selectedAttachment.download_path,
    download_paths: downloadPaths || [selectedAttachment.download_path],
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

const DOWNLOAD_TIMEOUT_MS = 20000;

async function fetchWithHttpsFallback(url) {
  const init = () => ({ headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  try {
    return await fetch(url, init());
  } catch (err) {
    // Some agency hosts (nspires.nasaprs.com) drop port 80 but serve HTTPS. Our own
    // timeout means the host answered too slowly, so retrying would just double the wait.
    if (!url.startsWith('http://') || err.name === 'TimeoutError') throw err;
    console.warn(`HTTP fetch failed for ${url} (${err.cause?.code || err.name}); retrying over HTTPS`);
    return await fetch(`https://${url.slice('http://'.length)}`, init());
  }
}

async function downloadFile(url) {
  const response = await fetchWithHttpsFallback(url);
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

function stripScriptAndStyle(html) {
  let s = html;
  for (;;) {
    const before = s.length;
    // Closing tag uses [^>]* so browser-tolerated junk like </script foo="bar"> or </script\t\n bar> is also stripped.
    s = s.replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, ' ');
    s = s.replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, ' ');
    if (s.length === before) break;
  }
  return s;
}

function htmlToText(html) {
  return stripScriptAndStyle(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const GRANT_KEYWORDS = [
  'grant', 'funding', 'applicant', 'eligib', 'award', 'nofo', 'notice',
  'opportunity', 'program', 'federal', 'application', 'deadline', 'narrative', 'budget',
];

// Loose keywords ("award", "application", "program") appear in the navigation
// menus of every agency site, so they can't distinguish a real NOFO from chrome.
// These STRUCTURAL patterns only appear in an actual solicitation's body.
const NOFO_STRUCTURE_PATTERNS = [
  /eligible applicant|who may apply|applicants? must|eligibility (criteria|requirement)/i,
  /\$[\d,]{4,}|award(s)? (up to|of|ceiling)|total (funding|program funding)|funding ceiling/i,
  /cost[- ]shar|matching (funds|requirement)|in-kind/i,
  /(closing|due|submission|application) (date|deadline)[\s:]*[a-z]*\s*\d|deadline[\s\S]{0,40}\d{4}/i,
  /letter of intent|required (documents|narrative|attachments)|project narrative|sf-?424/i,
];

// A rendered SPA shell whose real content never loaded (plain fetch does no JS).
function looksLikeUnloadedShell(text) {
  const t = text.trim().toLowerCase();
  if (t.length < 1500 && /\bloading\b|skip to (main |page )?content|enable javascript|please wait/.test(t)) {
    return true;
  }
  return false;
}

function isNofoContent(text) {
  if (!text || text.length < 500) return false;
  if (looksLikeUnloadedShell(text)) return false;

  const generic = GRANT_KEYWORDS.filter((kw) => text.toLowerCase().includes(kw)).length;
  const structure = NOFO_STRUCTURE_PATTERNS.filter((re) => re.test(text)).length;

  // A landing page trips generic keywords via its nav menus but carries almost
  // no structural NOFO content. Require multiple structural signals so scraped
  // program pages and site chrome are rejected as source documents.
  if (generic < 3) return false;
  if (structure < 2) return false;
  return true;
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

// Solicitation pages link the agency's strategic plans and program reports, which
// once won as the page's only PDF (NIH Strategic Plan, NSB Vision 2030, EPSCoR reports).
const NOT_A_NOFO_DOC_RE =
  /strategic[\s_-]*plan|\breports?\b|vision[\s_-]*20\d\d|workshop|eligibility[\s_-]*table|\bfaqs?\b|privacy/i;

function safeDecode(url) {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
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
    if (!rawHref || rawHref.startsWith('#')) continue;

    let parsed;
    try {
      parsed = new URL(rawHref, baseUrl);
    } catch {
      continue;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
    const absolute = parsed.toString();
    if (seen.has(absolute)) continue;
    if (!sameTldOrHost(absolute, baseUrl)) continue;
    if (NOT_A_NOFO_DOC_RE.test(`${safeDecode(absolute)} ${label}`)) continue;

    const strong = docPathRe.test(absolute);
    const weak = docLabelRe.test(label);
    if (!strong && !weak) continue;

    seen.add(absolute);
    candidates.push({ url: absolute, label: label || absolute.split('/').pop(), strong });
  }
  return candidates;
}

const FULL_PAGE_NOFO_MIN_CHARS = 20000;

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

  // NIH guide pages and NSF solicitation pages are the full NOFO as HTML; any PDF
  // they link is supplementary. Short landing pages that merely read "NOFO-ish"
  // are still chrome around the real document, so those keep following links.
  if (textIsNofo && text.length >= FULL_PAGE_NOFO_MIN_CHARS) {
    return { ...fallback, pageIsNofo: true };
  }

  const pool = strong.length > 0 ? strong : candidates;
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
  let followed;
  try {
    followed = await resolveNofoDocument(chosen.url, opportunityTitle, followDepth - 1);
  } catch (err) {
    console.warn(`Could not follow ${chosen.url}: ${err.cause?.code || err.message}`);
    followed = null;
  }
  if (!followed || followed.kind === 'html_raw' || followed.kind === 'other') {
    return fallback;
  }
  return { ...followed, followedFrom: finalUrl };
}

/**
 * Tries each candidate path in order; a dead, unreachable or unusable one falls
 * through to the next instead of failing the message. An additional_info_url is
 * a landing page, so it only counts when it reached a PDF or was itself the full
 * NOFO; otherwise saving it would just ingest site chrome.
 */
async function resolveFirstUsable(details) {
  const errors = [];
  for (const path of details.download_paths) {
    let resolved;
    try {
      resolved = await resolveNofoDocument(path, details.opportunity_title, 1);
    } catch (err) {
      console.warn(`Could not fetch ${path}: ${err.cause?.code || err.message}`);
      errors.push(err);
      continue;
    }
    if (!resolved) {
      console.log(`${path} returned 404/410 (dead link)`);
      continue;
    }
    if (resolved.kind === 'other') {
      console.log(`Unsupported content type at ${resolved.url}`);
      continue;
    }
    if (details.is_additional_info_url && resolved.kind !== 'pdf' && !resolved.pageIsNofo) {
      console.log(`${path} did not resolve to a NOFO (got ${resolved.kind})`);
      continue;
    }
    return resolved;
  }
  // Every path unreachable is an outage, not a bad link: let SQS retry and the DLQ surface it.
  if (errors.length === details.download_paths.length) throw errors[errors.length - 1];
  return null;
}

async function uploadToS3(key, fileBuffer, contentType) {
  await s3Client.send(
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: fileBuffer, ContentType: contentType })
  );
}

async function writeFederalScopeSidecar(sourceKey) {
  const sidecarKey = `${sourceKey}.metadata.json`;
  const lastSlash = sourceKey.lastIndexOf("/");
  const documentIdentifier =
    lastSlash >= 0 ? sourceKey.substring(0, lastSlash) : sourceKey;
  const baseFileName =
    lastSlash >= 0 ? sourceKey.substring(lastSlash + 1) : sourceKey;

  const body = JSON.stringify({
    metadataAttributes: {
      documentType: "NOFO",
      documentIdentifier,
      bucket: "nofo",
      fileName: baseFileName,
      processedAt: new Date().toISOString(),
      scope: "federal",
    },
  });

  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: sidecarKey,
      Body: body,
      ContentType: "application/json",
    })
  );
}

/**
 * Updates only the fields grants.gov owns; review, processing, pin and admin-only fields are left
 * alone, and scope/state/status/grant_type are set only on a new row. Without `landedHash` the
 * content_hash and source_updated_at stay as they were, so a failed upload is retried rather than
 * recorded as done (see recordLandedContent).
 */
async function writeMetadata(title, details, isUpdate, landedHash) {
  const now = new Date().toISOString();
  const sets = [
    'agency = :agency',
    'category = :category',
    'expiration_date = :expirationDate',
    'updated_at = :now',
    'created_at = if_not_exists(created_at, :now)',
    'grant_type = if_not_exists(grant_type, :federal)',
    '#scope = if_not_exists(#scope, :federal)',
    '#state = if_not_exists(#state, :noState)',
    '#status = if_not_exists(#status, :active)',
    'isPinned = if_not_exists(isPinned, :notPinned)',
  ];
  const values = {
    ':agency': details.agency_name || 'Unknown',
    ':category': details.category,
    ':expirationDate': normalizeDateToYYYYMMDD(details.close_date),
    ':now': now,
    ':federal': 'federal',
    ':noState': null,
    ':active': 'active',
    ':notPinned': 'false',
  };
  if (details.opportunity_id) {
    sets.push('opportunity_id = :opportunityId');
    values[':opportunityId'] = details.opportunity_id;
  }
  if (landedHash) {
    sets.push('content_hash = :hash', 'source_updated_at = :sourceUpdatedAt');
    values[':hash'] = landedHash;
    values[':sourceUpdatedAt'] = details.source_updated_at || null;
  }

  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: METADATA_TABLE,
      Key: marshall({ nofo_name: title }),
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: { '#scope': 'scope', '#state': 'state', '#status': 'status' },
      ExpressionAttributeValues: marshall(values),
    })
  );

  const action = isUpdate ? 'Updated' : 'Created';
  console.log(`${action} metadata for ${title} — Agency: ${details.agency_name}, Category: ${details.category}`);
}

async function recordLandedContent(title, details, contentHash) {
  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: METADATA_TABLE,
      Key: marshall({ nofo_name: title }),
      UpdateExpression: 'SET content_hash = :hash, source_updated_at = :sourceUpdatedAt, updated_at = :now',
      ExpressionAttributeValues: marshall({
        ':hash': contentHash,
        ':sourceUpdatedAt': details.source_updated_at || null,
        ':now': new Date().toISOString(),
      }),
    })
  );
}

// ---------------------------------------------------------------------------
// SQS Handler (batchSize 1, reportBatchItemFailures)
// ---------------------------------------------------------------------------

export const handler = async (event) => {
  const batchItemFailures = [];

  for (const record of event.Records) {
    const { messageId } = record;
    try {
      const { opportunityId, opportunityTitle, isUpdate, nofoName } = JSON.parse(record.body);
      const action = isUpdate ? 'Updating' : 'Processing new';
      console.log(`${action} opportunity ${opportunityId}: ${opportunityTitle}`);

      const details = await fetchOpportunityDetails(opportunityId);
      if (!details) {
        console.log(`Skipping ${opportunityId} — no eligible attachment`);
        continue;
      }

      await sleep(RATE_LIMIT_DELAY);

      const resolved = await resolveFirstUsable(details);
      if (!resolved) {
        console.log(`Skipping ${opportunityId} — no usable NOFO at ${details.download_paths.join(', ')}`);
        continue;
      }

      // The coordinator passes the stored name when grants.gov has retitled the
      // opportunity, so a rename updates the existing grant instead of duplicating it.
      const folderName = nofoName || normalizeNofoFolderName(details.opportunity_title);

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

      // The upload starts the pipeline, which reads this row, so the row goes first.
      await writeMetadata(folderName, details, isUpdate, contentChanged ? null : newHash);

      if (contentChanged) {
        await uploadToS3(s3Key, resolved.buffer, contentType);
        // pending-conversion HTML is under a different prefix; sidecar lands on conversion.
        if (resolved.kind === "pdf" || resolved.kind === "html_text") {
          await writeFederalScopeSidecar(s3Key);
        }
        await recordLandedContent(folderName, details, newHash);
        const followNote = resolved.followedFrom ? ` (followed from ${resolved.followedFrom})` : '';
        console.log(`Uploaded ${s3Key} (hash: ${newHash.substring(0, 12)}…, kind: ${resolved.kind})${followNote}`);
      } else {
        console.log(
          `Content unchanged for "${opportunityTitle}" (hash: ${newHash.substring(0, 12)}…), skipping S3 upload`
        );
      }

      console.log(`Completed ${opportunityId}${contentChanged ? '' : ' (metadata only)'}`);
    } catch (err) {
      console.error(`Failed to process SQS message ${messageId}:`, err);
      batchItemFailures.push({ itemIdentifier: messageId });
    }
  }

  return { batchItemFailures };
};
