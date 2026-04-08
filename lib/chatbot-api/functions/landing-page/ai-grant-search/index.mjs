/**
 * AI Grant Search Lambda
 *
 * Hybrid search: BM25 keyword + k-NN semantic via OpenSearch Serverless.
 * Uses native fetch + SigV4 signing for AOSS — no external npm packages needed.
 */

import { createHash, createHmac } from 'node:crypto';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const OPENSEARCH_ENDPOINT = process.env.OPENSEARCH_ENDPOINT;
const OPENSEARCH_INDEX = process.env.OPENSEARCH_INDEX;
const FEATURE_ROLLOUT_TABLE = process.env.FEATURE_ROLLOUT_TABLE_NAME;
const FEATURE_KEY = 'ai-grant-search';
const CONFIG_SUBJECT_KEY = 'CONFIG';
const FEATURE_ROLLOUT_MODES = new Set(['all', 'allowlisted', 'disabled']);

const TITAN_MODEL_ID = 'amazon.titan-embed-text-v2:0';
const EMBEDDING_DIM = 1024;
const MAX_RESULTS = 20;
const AOSS_TIMEOUT_MS = 10_000;
const BM25_SATURATION_K = 5.0;
const BM25_MIN_SHOULD_MATCH = '80%';
const KNN_FETCH_MULTIPLIER = 3;
const SHORT_QUERY_WORD_LIMIT = 3;

const SCORING = {
  short: { bm25Weight: 0.65, semanticWeight: 0.35, threshold: 0.55 },
  long:  { bm25Weight: 0.4,  semanticWeight: 0.6,  threshold: 0.40 },
};

const CHUNK_AGG_MAX_WEIGHT = 0.7;
const CHUNK_AGG_AVG_WEIGHT = 0.3;

const bedrockClient = new BedrockRuntimeClient({ region: REGION });
const dynamoClient = new DynamoDBClient({ region: REGION });


function sha256(data) {
  return createHash('sha256').update(data).digest();
}

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key, data) {
  return createHmac('sha256', key).update(data).digest();
}

function getSignatureKey(secretKey, dateStamp, region, service) {
  const kDate = hmacSha256('AWS4' + secretKey, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

async function aossRequest(method, path, body) {
  if (!OPENSEARCH_ENDPOINT) throw new Error('OPENSEARCH_ENDPOINT not set');

  const host = OPENSEARCH_ENDPOINT;
  const url = `https://${host}${path}`;
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.substring(0, 8);

  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN } = process.env;
  const payloadHash = sha256Hex(bodyStr);

  const headerEntries = [
    ['content-type', 'application/json'],
    ['host', host],
    ['x-amz-content-sha256', payloadHash],
    ['x-amz-date', amzDate],
  ];
  if (AWS_SESSION_TOKEN) {
    headerEntries.push(['x-amz-security-token', AWS_SESSION_TOKEN]);
  }
  headerEntries.sort((a, b) => a[0].localeCompare(b[0]));

  const signedHeaders = headerEntries.map(h => h[0]).join(';');
  const canonicalHeaders = headerEntries.map(h => `${h[0]}:${h[1]}\n`).join('');

  const canonicalRequest = [
    method,
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${REGION}/aoss/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSignatureKey(AWS_SECRET_ACCESS_KEY, dateStamp, REGION, 'aoss');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const fetchHeaders = Object.fromEntries(headerEntries);
  fetchHeaders['authorization'] = authorization;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AOSS_TIMEOUT_MS);

  try {
    const response = await fetch(url, { method, headers: fetchHeaders, body: bodyStr, signal: controller.signal });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AOSS ${method} ${path} failed (${response.status}): ${errText}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Main handler ──

export const handler = async (event) => {
  const startTime = Date.now();
  console.log('AI Grant Search invoked');

  try {
    const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
    const email = normalizeEmail(claims.email || claims['cognito:username'] || '');

    if (!email) {
      return respond(401, { message: 'Authenticated user email is missing', results: [], query: '', searchTimeMs: 0 });
    }

    const access = await getFeatureAccess(email);
    if (!access.canUse) {
      return respond(403, { message: 'AI grant search is not enabled for this user', results: [], query: '', searchTimeMs: 0 });
    }

    let body = {};
    if (event.body) {
      body = JSON.parse(event.body);
    }

    const { query } = body;

    if (!query || typeof query !== 'string' || query.trim().length < 3) {
      return respond(400, { message: 'Query must be at least 3 characters' });
    }

    const trimmedQuery = query.trim();
    const wordCount = trimmedQuery.split(/\s+/).filter(Boolean).length;
    console.log('Search query:', { query: trimmedQuery, wordCount });

    const embedding = await generateEmbedding(trimmedQuery);
    const results = await hybridSearch(trimmedQuery, embedding, MAX_RESULTS);
    const finalResults = results.slice(0, MAX_RESULTS);

    const searchTimeMs = Date.now() - startTime;
    console.log('Search complete:', { resultCount: finalResults.length, searchTimeMs });

    return respond(200, {
      results: finalResults,
      query: trimmedQuery,
      searchTimeMs,
    });
  } catch (error) {
    console.error('AI Grant Search error:', error);

    let message = 'Search failed';
    if (error.name === 'ThrottlingException' || error.name === 'TooManyRequestsException') {
      message = 'Search is temporarily unavailable due to high demand. Please try again in a moment.';
    } else if (error.name === 'AbortError' || error.message?.includes('abort')) {
      message = 'Search timed out. Please try a shorter or more specific query.';
    } else if (error.name === 'AccessDeniedException' || error.name === 'UnrecognizedClientException') {
      message = 'Search service configuration error. Please contact support.';
    } else if (error.message?.includes('OPENSEARCH') || error.message?.includes('AOSS')) {
      message = 'Search index is temporarily unavailable. Please try again shortly.';
    }

    return respond(500, { message, results: [], query: '', searchTimeMs: 0 });
  }
};

async function getFeatureAccess(email) {
  if (!FEATURE_ROLLOUT_TABLE) {
    return { enabled: false, allowed: false, canUse: false };
  }

  const [configResponse, userResponse] = await Promise.all([
    dynamoClient.send(
      new GetItemCommand({
        TableName: FEATURE_ROLLOUT_TABLE,
        Key: {
          featureKey: { S: FEATURE_KEY },
          subjectKey: { S: CONFIG_SUBJECT_KEY },
        },
      })
    ),
    dynamoClient.send(
      new GetItemCommand({
        TableName: FEATURE_ROLLOUT_TABLE,
        Key: {
          featureKey: { S: FEATURE_KEY },
          subjectKey: { S: `USER#${normalizeEmail(email)}` },
        },
      })
    ),
  ]);

  const config = configResponse.Item ? unmarshall(configResponse.Item) : null;
  const mode = resolveFeatureRolloutMode(config);
  const allowed = Boolean(userResponse.Item);
  return {
    mode,
    isAllowlisted: allowed,
    canUse: mode === 'all' || (mode === 'allowlisted' && allowed),
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveFeatureRolloutMode(config) {
  if (config && FEATURE_ROLLOUT_MODES.has(config.mode)) {
    return config.mode;
  }

  if (config?.enabled === true) {
    return 'allowlisted';
  }

  return 'disabled';
}

// ── Embedding ──

async function generateEmbedding(text) {
  const command = new InvokeModelCommand({
    modelId: TITAN_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      inputText: text,
      dimensions: EMBEDDING_DIM,
      normalize: true,
    }),
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  return responseBody.embedding;
}

async function hybridSearch(query, vector, k) {
  if (!OPENSEARCH_ENDPOINT || !OPENSEARCH_INDEX) {
    console.warn('OpenSearch not configured, skipping hybrid search');
    return [];
  }

  const searchPath = `/${OPENSEARCH_INDEX}/_search`;
  const wordCount = query.split(/\s+/).filter(Boolean).length;

  const profile = wordCount <= SHORT_QUERY_WORD_LIMIT ? SCORING.short : SCORING.long;
  const { bm25Weight, semanticWeight, threshold: scoreThreshold } = profile;

  try {
    const bm25MatchClause = { query, operator: 'or', minimum_should_match: BM25_MIN_SHOULD_MATCH };

    const knnSize = k * KNN_FETCH_MULTIPLIER;

    const [bm25Data, knnData] = await Promise.all([
      aossRequest('POST', searchPath, {
        size: k,
        query: { match: { text_field: bm25MatchClause } },
        _source: ['metadata_field'],
      }),
      aossRequest('POST', searchPath, {
        size: knnSize,
        query: { knn: { vector_field: { vector, k: knnSize } } },
        _source: ['metadata_field'],
      }),
    ]);

    const bm25Hits = bm25Data?.hits?.hits || [];
    const knnHits = knnData?.hits?.hits || [];

    const scoreMap = new Map();

    for (const hit of bm25Hits) {
      const name = extractNofoName(hit);
      if (!name) continue;
      const rawScore = hit._score || 0;
      const normalizedScore = rawScore / (rawScore + BM25_SATURATION_K);
      const existing = scoreMap.get(name) || { bm25: 0, semantic: 0 };
      existing.bm25 = Math.max(existing.bm25, normalizedScore);
      scoreMap.set(name, existing);
    }
    
    const rawKnnScores = knnHits.map((h) => h._score || 0);
    const knnMax = rawKnnScores.length > 0 ? Math.max(...rawKnnScores) : 1;
    const knnMin = rawKnnScores.length > 0 ? Math.min(...rawKnnScores) : 0;
    const knnRange = knnMax - knnMin || 1;

    const semanticChunks = new Map();
    for (const hit of knnHits) {
      const name = extractNofoName(hit);
      if (!name) continue;
      const chunkScore = (hit._score - knnMin) / knnRange;
      if (!semanticChunks.has(name)) semanticChunks.set(name, []);
      semanticChunks.get(name).push(chunkScore);
    }

    for (const [name, chunks] of semanticChunks) {
      const maxScore = Math.max(...chunks);
      const avgScore = chunks.reduce((sum, s) => sum + s, 0) / chunks.length;
      const aggregated = CHUNK_AGG_MAX_WEIGHT * maxScore + CHUNK_AGG_AVG_WEIGHT * avgScore;
      const existing = scoreMap.get(name) || { bm25: 0, semantic: 0 };
      existing.semantic = aggregated;
      scoreMap.set(name, existing);
    }

    // Combine and filter
    const accepted = [];
    const rejected = [];

    for (const [name, scores] of scoreMap) {
      const combined = (bm25Weight * scores.bm25) + (semanticWeight * scores.semantic);
      const detail = {
        name,
        bm25: Math.round(scores.bm25 * 1000) / 1000,
        semantic: Math.round(scores.semantic * 1000) / 1000,
        combined: Math.round(combined * 100) / 100,
      };

      if (combined > scoreThreshold) {
        let reason = '';
        if (scores.bm25 > 0 && scores.semantic > 0) {
          reason = 'Matched by keyword and meaning';
        } else if (scores.bm25 > 0) {
          reason = 'Matched by keyword';
        } else {
          reason = 'Matched by meaning';
        }
        accepted.push({ name, score: detail.combined, source: 'hybrid', reason });
      } else {
        rejected.push(detail);
      }
    }

    console.log(JSON.stringify({
      event: 'score_breakdown',
      query,
      scoreThreshold,
      accepted: accepted.map(r => {
        const s = scoreMap.get(r.name);
        const chunks = semanticChunks.get(r.name) || [];
        return {
          name: r.name,
          bm25: Math.round((s?.bm25 ?? 0) * 1000) / 1000,
          semantic: Math.round((s?.semantic ?? 0) * 1000) / 1000,
          combined: r.score,
          chunks: chunks.length,
          reason: r.reason,
        };
      }),
      rejected: {
        count: rejected.length,
        top: rejected.sort((a, b) => b.combined - a.combined).slice(0, 5),
      },
    }));

    accepted.sort((a, b) => b.score - a.score);
    console.log('Hybrid search summary:', {
      bm25Hits: bm25Hits.length,
      knnHits: knnHits.length,
      knnScoreRange: { min: Math.round(knnMin * 1000) / 1000, max: Math.round(knnMax * 1000) / 1000 },
      nofosFromChunks: semanticChunks.size,
      accepted: accepted.length,
      rejected: rejected.length,
      scoreThreshold,
      bm25Weight,
      semanticWeight,
    });

    return accepted;
  } catch (error) {
    console.error('Hybrid search error:', error.message);
    return [];
  }
}

function extractNofoName(hit) {
  try {
    const metadataRaw = hit._source?.metadata_field;
    if (!metadataRaw) return null;

    let metadata;
    try {
      metadata = JSON.parse(metadataRaw);
    } catch {
      return null;
    }

    const s3Uri = metadata.source || metadata['x-amz-bedrock-kb-source-uri'] || '';
    if (!s3Uri) return null;

    const parts = s3Uri.split('/');
    if (parts.length >= 4) {
      return parts[3].replace(/\/$/, '');
    }
    return null;
  } catch {
    return null;
  }
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}
