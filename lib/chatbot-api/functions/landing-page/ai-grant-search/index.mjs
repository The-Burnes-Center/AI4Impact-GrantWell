/**
 * AI Grant Search Lambda
 *
 * Three-layer search: hybrid (BM25 keyword + k-NN semantic) via OpenSearch,
 * category matching via DynamoDB CategoryIndex, and name matching via DynamoDB scan.
 * Results are merged, deduplicated, and scored. Name/category matches fill gaps
 * that hybrid search misses due to chunk limits.
 */

import { createHash, createHmac } from 'node:crypto';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, GetItemCommand, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const OPENSEARCH_ENDPOINT = process.env.OPENSEARCH_ENDPOINT;
const OPENSEARCH_INDEX = process.env.OPENSEARCH_INDEX;
const FEATURE_ROLLOUT_TABLE = process.env.FEATURE_ROLLOUT_TABLE_NAME;
const METADATA_TABLE = process.env.NOFO_METADATA_TABLE_NAME;
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
const CATEGORY_INDEX = 'CategoryIndex';
const CATEGORY_BOOST_SCORE = 0.45;
const NAME_MATCH_SCORE = 0.55;

// Short queries (≤3 words) favour BM25 keywords; longer queries favour semantic meaning
const SCORING = {
  short: { bm25Weight: 0.65, semanticWeight: 0.35, threshold: 0.46 },
  long:  { bm25Weight: 0.4,  semanticWeight: 0.6,  threshold: 0.40 },
};

const CHUNK_AGG_MAX_WEIGHT = 0.7;
const CHUNK_AGG_AVG_WEIGHT = 0.3;

const GRANT_CATEGORIES = [
  'Recovery Act', 'Agriculture', 'Arts', 'Business and Commerce',
  'Community Development', 'Consumer Protection', 'Disaster Prevention and Relief',
  'Education', 'Employment, Labor, and Training', 'Energy',
  'Energy Infrastructure and Critical Mineral and Materials (EICMM)',
  'Environment', 'Food and Nutrition', 'Health', 'Housing', 'Humanities',
  'Information and Statistics', 'Infrastructure Investment and Jobs Act',
  'Income Security and Social Services', 'Law, Justice, and Legal Services',
  'Natural Resources', 'Opportunity Zone Benefits', 'Regional Development',
  'Science, Technology, and Other Research and Development',
  'Transportation', 'Affordable Care Act',
];

const CATEGORY_LOOKUP = new Map(GRANT_CATEGORIES.map((c) => [c.toLowerCase(), c]));
const SINGLE_WORD_CATEGORIES = new Map(
  GRANT_CATEGORIES.filter((c) => !c.includes(' ')).map((c) => [c.toLowerCase(), c])
);

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'for', 'in', 'of', 'to', 'and', 'on', 'with', 'by',
  'grants', 'grant', 'funding', 'fund', 'funds', 'opportunities', 'opportunity',
  'programs', 'program', 'support', 'related',
  'federal', 'state', 'local', 'national', 'government',
]);

const bedrockClient = new BedrockRuntimeClient({ region: REGION });
const dynamoClient = new DynamoDBClient({ region: REGION });

// ── SigV4 signing (node:crypto, zero deps) ──

function sigv4Sign(method, host, path, bodyStr) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.substring(0, 8);
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN } = process.env;

  const payloadHash = createHash('sha256').update(bodyStr).digest('hex');

  const headers = {
    'content-type': 'application/json',
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (AWS_SESSION_TOKEN) headers['x-amz-security-token'] = AWS_SESSION_TOKEN;

  const sortedKeys = Object.keys(headers).sort();
  const signedHeaders = sortedKeys.join(';');
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${headers[k]}\n`).join('');

  const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${REGION}/aoss/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');

  let key = createHmac('sha256', `AWS4${AWS_SECRET_ACCESS_KEY}`).update(dateStamp).digest();
  for (const part of [REGION, 'aoss', 'aws4_request']) key = createHmac('sha256', key).update(part).digest();
  const signature = createHmac('sha256', key).update(stringToSign).digest('hex');

  headers.authorization = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

async function aossRequest(method, path, body) {
  if (!OPENSEARCH_ENDPOINT) throw new Error('OPENSEARCH_ENDPOINT not set');

  const host = OPENSEARCH_ENDPOINT;
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  const headers = sigv4Sign(method, host, path, bodyStr);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AOSS_TIMEOUT_MS);

  try {
    const response = await fetch(`https://${host}${path}`, { method, headers, body: bodyStr, signal: controller.signal });
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

    const matchedCategory = matchCategory(trimmedQuery);
    const [hybridResults, categoryNames, nameMatches] = await Promise.all([
      hybridSearch(trimmedQuery, embedding, MAX_RESULTS),
      matchedCategory ? fetchGrantsByCategory(matchedCategory) : [],
      fetchGrantsByName(trimmedQuery),
    ]);

    // Merge all sources, deduplicate, boost hybrid results that also matched by name
    const nameSet = new Set(nameMatches);
    const seen = new Set();
    const all = [];

    for (const r of hybridResults) {
      seen.add(r.name);
      if (nameSet.has(r.name)) r.score = Math.max(r.score, r.score + 0.15);
      all.push(r);
    }

    for (const name of nameMatches) {
      if (seen.has(name)) continue;
      seen.add(name);
      all.push({ name, score: NAME_MATCH_SCORE, source: 'name', reason: 'Matched by grant name' });
    }

    for (const name of categoryNames) {
      if (seen.has(name)) continue;
      seen.add(name);
      all.push({ name, score: CATEGORY_BOOST_SCORE, source: 'category', reason: `In category: ${matchedCategory}` });
    }

    all.sort((a, b) => b.score - a.score);
    const finalResults = all.slice(0, MAX_RESULTS);

    if (nameMatches.length > 0) console.log(`Name matches: ${nameMatches.length} grants contain "${trimmedQuery}" in name`);
    if (categoryNames.length > 0) console.log(`Category matches: ${categoryNames.length} grants in "${matchedCategory}"`);

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

// ── Feature access ──

async function getFeatureAccess(email) {
  if (!FEATURE_ROLLOUT_TABLE) {
    return { enabled: false, allowed: false, canUse: false };
  }

  const [configResponse, userResponse] = await Promise.all([
    dynamoClient.send(
      new GetItemCommand({
        TableName: FEATURE_ROLLOUT_TABLE,
        Key: { featureKey: { S: FEATURE_KEY }, subjectKey: { S: CONFIG_SUBJECT_KEY } },
      })
    ),
    dynamoClient.send(
      new GetItemCommand({
        TableName: FEATURE_ROLLOUT_TABLE,
        Key: { featureKey: { S: FEATURE_KEY }, subjectKey: { S: `USER#${normalizeEmail(email)}` } },
      })
    ),
  ]);

  const config = configResponse.Item ? unmarshall(configResponse.Item) : null;
  const mode = resolveFeatureRolloutMode(config);
  const allowed = Boolean(userResponse.Item);
  return { mode, isAllowlisted: allowed, canUse: mode === 'all' || (mode === 'allowlisted' && allowed) };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveFeatureRolloutMode(config) {
  if (config && FEATURE_ROLLOUT_MODES.has(config.mode)) return config.mode;
  if (config?.enabled === true) return 'allowlisted';
  return 'disabled';
}

// ── Category matching — matches query against GRANT_CATEGORIES with fuzzy tolerance ──

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
      prev = tmp;
    }
  }
  return dp[m];
}

function fuzzyMatchCategory(word, lookup) {
  if (word.length < 4) return null;
  const maxDist = word.length >= 6 ? 2 : 1;
  let best = null, bestDist = maxDist + 1;
  for (const [key, value] of lookup) {
    const d = editDistance(word, key);
    if (d === 0) return value;
    if (d < bestDist) { best = value; bestDist = d; }
  }
  return bestDist <= maxDist ? best : null;
}

/**
 * Match query to a category. Strips stop words, tries full phrase first,
 * then single-word fuzzy match (only when one meaningful word remains).
 * "transportation" → Transportation, "mental health" → no match (not = "Health")
 */
function matchCategory(query) {
  const words = query.toLowerCase().split(/\s+/).filter((w) => !STOP_WORDS.has(w) && w.length > 1);
  if (words.length === 0) return null;

  const phrase = words.join(' ');
  const exactMatch = CATEGORY_LOOKUP.get(phrase);
  if (exactMatch) return exactMatch;

  if (words.length === 1) {
    const match = fuzzyMatchCategory(words[0], SINGLE_WORD_CATEGORIES);
    if (match) return match;
  }

  return null;
}

async function fetchGrantsByCategory(category) {
  if (!METADATA_TABLE) return [];
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: METADATA_TABLE,
        IndexName: CATEGORY_INDEX,
        KeyConditionExpression: 'category = :cat',
        ExpressionAttributeValues: { ':cat': { S: category } },
        ProjectionExpression: 'nofo_name',
      })
    );
    return (result.Items || []).map((item) => unmarshall(item).nofo_name).filter(Boolean);
  } catch (err) {
    console.error('Category lookup failed:', err.message);
    return [];
  }
}

// ── Name matching — scans DynamoDB for grants whose name contains query words (with stemming) ──

function stem(word) {
  if (word.length < 6) return word;
  return word.replace(/(tion|sion|ment|ness|ence|ance|ient|able|ible|ing|ity|ous|ive|ful|less|al|ly|er|ed|es|s)$/i, '');
}

function nameContainsWord(lowerName, word, stemmed) {
  const wordRegex = new RegExp(`\\b${word}`, 'i');
  if (wordRegex.test(lowerName)) return true;
  if (stemmed !== word && stemmed.length >= 4) {
    const stemRegex = new RegExp(`\\b${stemmed}`, 'i');
    return stemRegex.test(lowerName);
  }
  return false;
}

async function fetchGrantsByName(query) {
  if (!METADATA_TABLE) return [];
  try {
    const result = await dynamoClient.send(
      new ScanCommand({ TableName: METADATA_TABLE, ProjectionExpression: 'nofo_name' })
    );
    const allNames = (result.Items || []).map((item) => unmarshall(item).nofo_name).filter(Boolean);

    const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const queryStems = queryWords.map(stem);

    return allNames.filter((name) => {
      const lowerName = name.toLowerCase();
      return queryWords.every((word, i) => nameContainsWord(lowerName, word, queryStems[i]));
    });
  } catch (err) {
    console.error('Name lookup failed:', err.message);
    return [];
  }
}

// ── Embedding ──

async function generateEmbedding(text) {
  const command = new InvokeModelCommand({
    modelId: TITAN_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({ inputText: text, dimensions: EMBEDDING_DIM, normalize: true }),
  });

  const response = await bedrockClient.send(command);
  return JSON.parse(new TextDecoder().decode(response.body)).embedding;
}

// ── Hybrid search — BM25 keyword + k-NN semantic via OpenSearch Serverless ──

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
    const knnSize = k * KNN_FETCH_MULTIPLIER;

    const [bm25Data, knnData] = await Promise.all([
      aossRequest('POST', searchPath, {
        size: k,
        query: { match: { text_field: { query, operator: 'or', minimum_should_match: BM25_MIN_SHOULD_MATCH, fuzziness: 'AUTO' } } },
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
      const existing = scoreMap.get(name) || { bm25: 0, semantic: 0 };
      existing.bm25 = Math.max(existing.bm25, rawScore / (rawScore + BM25_SATURATION_K));
      scoreMap.set(name, existing);
    }

    // Min-max normalize k-NN scores (AOSS cosine returns >1.0, hard clamping destroys differentiation)
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

    // Aggregate per-NOFO: blend best chunk with average for both peak relevance and breadth
    for (const [name, chunks] of semanticChunks) {
      const aggregated = CHUNK_AGG_MAX_WEIGHT * Math.max(...chunks) + CHUNK_AGG_AVG_WEIGHT * (chunks.reduce((s, v) => s + v, 0) / chunks.length);
      const existing = scoreMap.get(name) || { bm25: 0, semantic: 0 };
      existing.semantic = aggregated;
      scoreMap.set(name, existing);
    }

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
        let reason = scores.bm25 > 0 && scores.semantic > 0 ? 'Matched by keyword and meaning'
          : scores.bm25 > 0 ? 'Matched by keyword' : 'Matched by meaning';
        accepted.push({ name, score: detail.combined, source: 'hybrid', reason });
      } else {
        rejected.push(detail);
      }
    }

    console.log(JSON.stringify({
      event: 'score_breakdown', query, scoreThreshold,
      accepted: accepted.map(({ name, score, reason }) => ({ name, combined: score, reason })),
      rejected: { count: rejected.length, top: rejected.sort((a, b) => b.combined - a.combined).slice(0, 5) },
    }));

    accepted.sort((a, b) => b.score - a.score);
    console.log('Hybrid search summary:', {
      bm25Hits: bm25Hits.length, knnHits: knnHits.length,
      knnScoreRange: { min: Math.round(knnMin * 1000) / 1000, max: Math.round(knnMax * 1000) / 1000 },
      nofosFromChunks: semanticChunks.size,
      accepted: accepted.length, rejected: rejected.length,
      scoreThreshold, bm25Weight, semanticWeight,
    });

    return accepted;
  } catch (error) {
    console.error('Hybrid search error:', error.message);
    return [];
  }
}

function extractNofoName(hit) {
  const metadataRaw = hit._source?.metadata_field;
  if (!metadataRaw) return null;

  let metadata;
  try { metadata = JSON.parse(metadataRaw); } catch { return null; }

  const s3Uri = metadata.source || metadata['x-amz-bedrock-kb-source-uri'] || '';
  if (!s3Uri) return null;

  const parts = s3Uri.split('/');
  return parts.length >= 4 ? parts[3].replace(/\/$/, '') : null;
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}
