/**
 * AI Grant Search Lambda
 *
 * Three layers: hybrid (BM25 keyword + cosine semantic) over the per-grant search index the builder
 * keeps in ARTIFACTS_BUCKET/_search/, category matching and name matching over the grant metadata.
 * Results are merged, deduplicated, and scored. Only grants the caller may see (same state rule as
 * the grant list) are scored or returned. The only model call is the query embedding.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, GetItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { canEditAnyNofo, recordEvent, touchLastActive } from 'grantwell-shared';
import { EMBEDDING_DIM, POINTER_KEY, decodeIndex, rankHybrid } from './search-core.mjs';

const REGION = process.env.AWS_REGION || 'us-east-1';
const INDEX_BUCKET = process.env.SEARCH_INDEX_BUCKET;
const FEATURE_ROLLOUT_TABLE = process.env.FEATURE_ROLLOUT_TABLE_NAME;
const METADATA_TABLE = process.env.NOFO_METADATA_TABLE_NAME;
const FEATURE_KEY = 'ai-grant-search';
const CONFIG_SUBJECT_KEY = 'CONFIG';
const FEATURE_ROLLOUT_MODES = new Set(['all', 'allowlisted', 'disabled']);

const TITAN_MODEL_ID = process.env.TITAN_MODEL_ID;
const MAX_RESULTS = 50;
const INDEX_REFRESH_MS = 60_000;
const CATEGORY_BOOST_SCORE = 0.45;
const NAME_MATCH_SCORE = 0.55;
const NAME_MATCH_MIN_FRACTION = 0.5;
const RECENCY_TIE_EPSILON = 0.05;
const INDEX_NOT_READY_MESSAGE =
  'AI search is still being set up, so these results match grant names and categories only. Try again in a few minutes.';

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
  'Transportation', 'Affordable Care Act', 'Other',
];

const CATEGORY_LOOKUP = new Map(GRANT_CATEGORIES.map((c) => [c.toLowerCase(), c]));
// "Other" matches exactly only; fuzzily it would catch "mother" or "otter".
const SINGLE_WORD_CATEGORIES = new Map(
  GRANT_CATEGORIES.filter((c) => !c.includes(' ') && c !== 'Other').map((c) => [c.toLowerCase(), c])
);

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'for', 'in', 'of', 'to', 'and', 'on', 'with', 'by',
  'grants', 'grant', 'funding', 'fund', 'funds', 'opportunities', 'opportunity',
  'programs', 'program', 'support', 'related',
  'federal', 'state', 'local', 'national', 'government',
]);

// Intent filter terms — stripped from the search text and used to filter results.
const OPEN_TERMS = new Set(['open', 'active', 'current', 'available', 'accepting']);
const CLOSED_TERMS = new Set(['closed', 'expired', 'past', 'archived', 'ended']);
const ROLLING_TERMS = new Set(['rolling']);

const CATEGORY_SYNONYMS = new Map([
  ['resilience', ['Disaster Prevention and Relief', 'Environment', 'Infrastructure Investment and Jobs Act']],
  ['climate',    ['Environment', 'Energy', 'Disaster Prevention and Relief']],
  ['disaster',   ['Disaster Prevention and Relief']],
  ['emergency',  ['Disaster Prevention and Relief']],
  ['flood',      ['Disaster Prevention and Relief', 'Environment']],
  ['flooding',   ['Disaster Prevention and Relief', 'Environment']],
  ['wildfire',   ['Disaster Prevention and Relief', 'Natural Resources']],
  ['hurricane',  ['Disaster Prevention and Relief']],
  ['water',      ['Environment', 'Natural Resources']],
  ['conservation', ['Natural Resources', 'Environment']],
  ['wildlife',   ['Natural Resources']],
  ['pollution',  ['Environment']],
  ['recycling',  ['Environment']],
  ['sustainability', ['Environment', 'Energy']],
  ['renewable',  ['Energy']],
  ['solar',      ['Energy']],
  ['wind',       ['Energy']],
  ['battery',    ['Energy', 'Energy Infrastructure and Critical Mineral and Materials (EICMM)']],
  ['grid',       ['Energy', 'Energy Infrastructure and Critical Mineral and Materials (EICMM)']],
  ['mineral',    ['Energy Infrastructure and Critical Mineral and Materials (EICMM)']],
  ['transit',    ['Transportation', 'Infrastructure Investment and Jobs Act']],
  ['road',       ['Transportation', 'Infrastructure Investment and Jobs Act']],
  ['bridge',     ['Transportation', 'Infrastructure Investment and Jobs Act']],
  ['highway',    ['Transportation', 'Infrastructure Investment and Jobs Act']],
  ['broadband',  ['Infrastructure Investment and Jobs Act', 'Information and Statistics']],
  ['infrastructure', ['Infrastructure Investment and Jobs Act']],
  ['mental',     ['Health']],
  ['medical',    ['Health']],
  ['hospital',   ['Health']],
  ['healthcare', ['Health', 'Affordable Care Act']],
  ['substance',  ['Health']],
  ['nutrition',  ['Food and Nutrition']],
  ['food',       ['Food and Nutrition']],
  ['school',     ['Education']],
  ['schools',    ['Education']],
  ['student',    ['Education']],
  ['workforce',  ['Employment, Labor, and Training']],
  ['job',        ['Employment, Labor, and Training']],
  ['jobs',       ['Employment, Labor, and Training']],
  ['training',   ['Employment, Labor, and Training']],
  ['apprenticeship', ['Employment, Labor, and Training']],
  ['housing',    ['Housing']],
  ['homelessness', ['Housing', 'Income Security and Social Services']],
  ['rural',      ['Regional Development', 'Agriculture']],
  ['farm',       ['Agriculture']],
  ['farming',    ['Agriculture']],
  ['museum',     ['Arts', 'Humanities']],
  ['research',   ['Science, Technology, and Other Research and Development']],
  ['technology', ['Science, Technology, and Other Research and Development']],
  ['stem',       ['Science, Technology, and Other Research and Development', 'Education']],
  ['justice',    ['Law, Justice, and Legal Services']],
  ['legal',      ['Law, Justice, and Legal Services']],
  ['veteran',    ['Income Security and Social Services']],
  ['veterans',   ['Income Security and Social Services']],
  ['senior',     ['Income Security and Social Services', 'Health']],
  ['seniors',    ['Income Security and Social Services', 'Health']],
  ['consumer',   ['Consumer Protection']],
]);

// SUPPORTED_STATES injected as [{code,name}] (from config.states via supportedStatesEnv in lib/config/instance-config.ts).
const SUPPORTED_STATE_CODES = (() => {
  try {
    const parsed = JSON.parse(process.env.SUPPORTED_STATES || '[]');
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((s) => s && typeof s.code === 'string').map((s) => s.code));
  } catch {
    return new Set();
  }
})();

// Platform authority comes from the explicit PlatformAdmin role; this flag keeps pre-migration
// stateless admins working and must stay on until every pool is migrated.
const LEGACY_STATELESS_ADMIN_IS_PLATFORM =
  String(process.env.LEGACY_STATELESS_ADMIN_IS_PLATFORM ?? 'true').toLowerCase() !== 'false';

const bedrockClient = new BedrockRuntimeClient({ region: REGION });
const dynamoClient = new DynamoDBClient({ region: REGION });
const s3Client = new S3Client({ region: REGION });

// ── Main handler ──

export const handler = async (event) => {
  const startTime = Date.now();
  console.log('AI Grant Search invoked');

  try {
    const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
    // Allowlist entries are emails, and an unverified one may be anyone's address.
    const email = String(claims.email_verified) === 'true' ? normalizeEmail(claims.email) : '';

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

    const { query, committed } = body;

    if (!query || typeof query !== 'string' || query.trim().length < 3) {
      return respond(400, { message: 'Query must be at least 3 characters' });
    }

    const trimmedQuery = query.trim();

    // Only record *committed* searches (Enter / result selection) for analytics. The search bar
    // fires on every debounced keystroke, so logging each call would count "trans", "transpor",
    // "transportation" as separate queries. `committed` is sent by the client for the deliberate
    // search; debounced-as-you-type calls omit it. Best-effort; never affects search results.
    const analytics = claims.sub && committed === true
      ? (async () => {
        const state = String(claims['custom:state'] || '').trim().toUpperCase();
        await recordEvent({ eventType: 'search', userId: claims.sub, state, queryText: trimmedQuery });
        await touchLastActive(claims.sub, state);
      })()
      : Promise.resolve();

    const { statusFilter, rollingOnly, cleanedQuery } = parseIntent(trimmedQuery);
    const searchQuery = cleanedQuery.length >= 3 ? cleanedQuery : trimmedQuery;
    const wordCount = searchQuery.split(/\s+/).filter(Boolean).length;
    console.log('Search query:', { query: trimmedQuery, searchQuery, statusFilter, rollingOnly, wordCount });

    const intentFilterActive = Boolean(statusFilter || rollingOnly);
    const callerScope = resolveCallerScope(event);
    const timings = {};
    const timed = (label, promise) => {
      const t0 = Date.now();
      return promise.finally(() => { timings[label] = Date.now() - t0; });
    };
    const [metaMap, embedding, loaded] = await Promise.all([
      timed('metadataMs', getMetadataCache()),
      timed('embeddingMs', generateEmbedding(searchQuery)),
      timed('indexMs', loadSearchIndex()),
      analytics,
    ]);
    const isVisible = (name) => callerCanSeeGrant(callerScope, metaMap.get(name));

    const rankStart = Date.now();
    const hybridResults = loaded.index ? hybridSearch(loaded.index, searchQuery, embedding, isVisible, callerScope.state) : [];
    const matchedCategories = matchCategory(searchQuery);
    const categoryFetches = matchedCategories.map((category) => ({
      category,
      names: grantsInCategory(metaMap, category).filter(isVisible),
    }));
    const nameMatches = matchGrantsByName(metaMap, searchQuery, isVisible);
    timings.rankMs = Date.now() - rankStart;

    // Merge all sources, deduplicate, boost hybrid results that also matched by name.
    // Name scores scale with the fraction of query words matched, so a partial match
    // cannot outrank a full one the way a flat score did.
    const seen = new Set();
    const all = [];

    for (const r of hybridResults) {
      seen.add(r.name);
      const fraction = nameMatches.get(r.name);
      if (fraction) r.score += 0.15 * fraction;
      all.push(r);
    }

    for (const [name, fraction] of nameMatches) {
      if (seen.has(name)) continue;
      seen.add(name);
      all.push({
        name,
        score: NAME_MATCH_SCORE * fraction,
        source: 'name',
        reason: fraction === 1 ? 'Matched by grant name' : 'Partially matched by grant name',
      });
    }

    let totalCategoryHits = 0;
    for (const { category, names } of categoryFetches) {
      totalCategoryHits += names.length;
      for (const name of names) {
        if (seen.has(name)) continue;
        seen.add(name);
        all.push({ name, score: CATEGORY_BOOST_SCORE, source: 'category', reason: `In category: ${category}` });
      }
    }

    let finalPool = all;
    let filteredOut = 0;
    if (intentFilterActive) {
      finalPool = all.filter((r) => matchesIntentFilter(metaMap.get(r.name), statusFilter, rollingOnly));
      filteredOut = all.length - finalPool.length;
    }
    finalPool.sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (Math.abs(scoreDiff) >= RECENCY_TIE_EPSILON) return scoreDiff;
      const aTs = expirationTimestamp(metaMap.get(a.name));
      const bTs = expirationTimestamp(metaMap.get(b.name));
      if (aTs !== bTs) return bTs - aTs;
      return scoreDiff;
    });
    const finalResults = finalPool.slice(0, MAX_RESULTS);

    if (nameMatches.size > 0) console.log(`Name matches: ${nameMatches.size} grants contain "${searchQuery}" in name`);
    if (totalCategoryHits > 0) console.log(`Category matches: ${totalCategoryHits} grants across [${matchedCategories.join(', ')}]`);

    const searchTimeMs = Date.now() - startTime;
    console.log('Search complete:', {
      resultCount: finalResults.length, filteredOut, statusFilter, rollingOnly, searchTimeMs,
      indexStatus: loaded.status, indexBuildId: loaded.index?.buildId ?? null, ...timings,
    });

    return respond(200, {
      results: finalResults,
      query: trimmedQuery,
      searchTimeMs,
      ...(loaded.status === 'building' && { indexStatus: 'building', message: INDEX_NOT_READY_MESSAGE }),
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
    }

    return respond(500, { message, results: [], query: '', searchTimeMs: 0 });
  }
};

// ── Caller scope — same rule as the grant list (retrieve-nofos) ──

function parseRoles(raw) {
  if (Array.isArray(raw)) return raw.filter((r) => typeof r === 'string');
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((r) => typeof r === 'string') : [];
  } catch {
    return [raw];
  }
}

function resolveCallerScope(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
  const roles = parseRoles(claims['custom:role']);
  const stateRaw = String(claims['custom:state'] || '').trim().toUpperCase();
  const state = SUPPORTED_STATE_CODES.has(stateRaw) ? stateRaw : '';

  if (roles.includes('Developer')) return { role: 'developer', state };
  if (roles.includes('PlatformAdmin')) return { role: 'regularAdmin', state: '' };
  if (roles.includes('Admin')) {
    if (state) return { role: 'stateAdmin', state };
    return LEGACY_STATELESS_ADMIN_IS_PLATFORM
      ? { role: 'regularAdmin', state: '' }
      : { role: 'unscopedAdmin', state: '' };
  }
  return { role: 'user', state };
}

function callerCanSeeGrant(callerScope, meta) {
  if (callerScope.role === 'developer' || callerScope.role === 'regularAdmin') return true;
  if (!meta) return false;
  const scope = meta.scope || 'federal';
  const ownState = scope === 'state' && Boolean(meta.state) && meta.state === callerScope.state;
  // A grant held for review shows only to those who may open it: its own state's admins, or any
  // admin of a single-state site (canEditAnyNofo).
  if (meta.status === 'quarantined' || meta.status === 'processing') {
    return callerScope.role === 'stateAdmin' && (ownState || canEditAnyNofo(callerScope));
  }
  return scope === 'federal' || ownState;
}

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


function matchCategory(query) {
  const words = query.toLowerCase().split(/\s+/).filter((w) => !STOP_WORDS.has(w) && w.length > 1);
  if (words.length === 0) return [];

  const phrase = words.join(' ');
  const exactMatch = CATEGORY_LOOKUP.get(phrase);
  if (exactMatch) return [exactMatch];

  if (words.length === 1) {
    const match = fuzzyMatchCategory(words[0], SINGLE_WORD_CATEGORIES);
    if (match) return [match];
  }

  const synonymHits = new Set();
  for (const w of words) {
    const cats = CATEGORY_SYNONYMS.get(w);
    if (cats) for (const c of cats) synonymHits.add(c);
  }
  return [...synonymHits];
}

function parseIntent(query) {
  const tokens = query.split(/\s+/).filter(Boolean);
  let statusFilter = null;
  let rollingOnly = false;
  const kept = [];
  for (const tok of tokens) {
    const norm = tok.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (OPEN_TERMS.has(norm))       { statusFilter = 'open';   continue; }
    if (CLOSED_TERMS.has(norm))     { statusFilter = 'closed'; continue; }
    if (ROLLING_TERMS.has(norm))    { rollingOnly = true;      continue; }
    kept.push(tok);
  }
  return { statusFilter, rollingOnly, cleanedQuery: kept.join(' ').trim() };
}

const METADATA_CACHE_TTL_MS = 5 * 60 * 1000;
let metadataCache = null;
let metadataCacheFetchedAt = 0;
let inflightMetadataFetch = null;

async function getMetadataCache() {
  const now = Date.now();
  if (metadataCache && now - metadataCacheFetchedAt < METADATA_CACHE_TTL_MS) return metadataCache;
  if (inflightMetadataFetch) return inflightMetadataFetch;
  if (!METADATA_TABLE) throw new Error('NOFO_METADATA_TABLE_NAME not set');

  inflightMetadataFetch = (async () => {
    const map = new Map();
    let lastKey;
    try {
      do {
        const result = await dynamoClient.send(
          new ScanCommand({
            TableName: METADATA_TABLE,
            ProjectionExpression: 'nofo_name, #s, expiration_date, is_rolling, #scope, #state, category',
            ExpressionAttributeNames: { '#s': 'status', '#scope': 'scope', '#state': 'state' },
            ExclusiveStartKey: lastKey,
          })
        );
        for (const item of result.Items || []) {
          const m = unmarshall(item);
          if (m.nofo_name) map.set(m.nofo_name, m);
        }
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);
      metadataCache = map;
      metadataCacheFetchedAt = Date.now();
      console.log('Metadata cache populated:', { entries: map.size });
      return map;
    } catch (err) {
      console.error('Metadata cache scan failed:', err.message);
      // Serve stale cache; with none, fail the search rather than return unscoped results
      if (metadataCache) return metadataCache;
      throw err;
    } finally {
      inflightMetadataFetch = null;
    }
  })();

  return inflightMetadataFetch;
}

function isRolling(meta) {
  const v = meta?.is_rolling;
  return v === true || v === 'true';
}

function expirationTimestamp(meta) {
  if (!meta) return 0;
  if (meta.status === 'archived') return 0;
  if (isRolling(meta)) return Number.POSITIVE_INFINITY;
  if (!meta.expiration_date) return 0;
  const t = Date.parse(meta.expiration_date);
  return Number.isNaN(t) ? 0 : t;
}

function matchesIntentFilter(meta, statusFilter, rollingOnly) {
  // Missing metadata → keep the result rather than silently dropping it.
  if (!meta) return true;
  if (rollingOnly && !isRolling(meta)) return false;
  if (!statusFilter) return true;
  const now = Date.now();
  if (statusFilter === 'open') {
    if (meta.status === 'archived') return false;
    if (isRolling(meta)) return true;
    if (!meta.expiration_date) return true;
    const t = Date.parse(meta.expiration_date);
    return Number.isNaN(t) ? true : t >= now;
  }
  if (statusFilter === 'closed') {
    if (meta.status === 'archived') return true;
    if (!meta.expiration_date) return false;
    const t = Date.parse(meta.expiration_date);
    return Number.isNaN(t) ? false : t < now;
  }
  return true;
}

function grantsInCategory(metaMap, category) {
  const names = [];
  for (const [name, meta] of metaMap) if (meta.category === category) names.push(name);
  return names;
}

// ── Name matching — grants whose name contains query words (with stemming) ──

function stem(word) {
  if (word.length < 6) return word;
  return word.replace(/(tion|sion|ment|ness|ence|ance|ient|able|ible|ing|ity|ous|ive|ful|less|al|ly|er|ed|es|s)$/i, '');
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function nameContainsWord(lowerName, word, stemmed) {
  const wordRegex = new RegExp(`\\b${escapeRegex(word)}`, 'i');
  if (wordRegex.test(lowerName)) return true;
  if (stemmed !== word && stemmed.length >= 4) {
    const stemRegex = new RegExp(`\\b${escapeRegex(stemmed)}`, 'i');
    return stemRegex.test(lowerName);
  }
  return false;
}

/**
 * Returns Map<name, fraction> for grants matching at least NAME_MATCH_MIN_FRACTION of the
 * query words. Requiring *every* word (the previous rule) collapsed to ~10% recall as soon
 * as a user added a word not in the title ("grants", a state name) — the dominant real shape.
 */
function matchGrantsByName(metaMap, query, isVisible) {
  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (queryWords.length === 0) return new Map();
  const queryStems = queryWords.map(stem);

  const matches = new Map();
  for (const name of metaMap.keys()) {
    if (!isVisible(name)) continue;
    const lowerName = name.toLowerCase();
    let hits = 0;
    for (let i = 0; i < queryWords.length; i++) {
      if (nameContainsWord(lowerName, queryWords[i], queryStems[i])) hits++;
    }
    const fraction = hits / queryWords.length;
    if (fraction >= NAME_MATCH_MIN_FRACTION) matches.set(name, fraction);
  }
  return matches;
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

// ── Search index — loaded from S3, kept across warm invocations, swapped when the pointer moves ──

let searchIndex = null;
let indexCheckedAt = 0;
let inflightIndex = null;

const isMissing = (e) => e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
const isNotModified = (e) => e?.name === 'NotModified' || e?.$metadata?.httpStatusCode === 304;

async function refreshSearchIndex() {
  if (!INDEX_BUCKET) throw new Error('SEARCH_INDEX_BUCKET not set');
  let pointerRes;
  try {
    pointerRes = await s3Client.send(new GetObjectCommand({
      Bucket: INDEX_BUCKET,
      Key: POINTER_KEY,
      ...(searchIndex && { IfNoneMatch: searchIndex.pointerEtag }),
    }));
  } catch (error) {
    if (isNotModified(error) && searchIndex) {
      indexCheckedAt = Date.now();
      return searchIndex.index;
    }
    if (isMissing(error) && !searchIndex) return null;
    throw error;
  }
  const pointer = JSON.parse(await pointerRes.Body.transformToString());
  if (searchIndex?.indexKey !== pointer.indexKey) {
    const t0 = Date.now();
    const res = await s3Client.send(new GetObjectCommand({ Bucket: INDEX_BUCKET, Key: pointer.indexKey }));
    const bytes = await res.Body.transformToByteArray();
    const downloadMs = Date.now() - t0;
    const index = decodeIndex(bytes);
    console.log('Search index loaded:', {
      buildId: index.buildId, grants: index.docs.length, bytes: bytes.byteLength, downloadMs, parseMs: Date.now() - t0 - downloadMs,
    });
    searchIndex = { index, indexKey: pointer.indexKey, pointerEtag: pointerRes.ETag };
  } else {
    searchIndex.pointerEtag = pointerRes.ETag;
  }
  indexCheckedAt = Date.now();
  return searchIndex.index;
}

/** {index, status}: status is 'ready', 'building' (nothing built yet) or 'unavailable'. Never throws. */
async function loadSearchIndex() {
  try {
    let index = searchIndex?.index;
    if (!index || Date.now() - indexCheckedAt >= INDEX_REFRESH_MS) {
      inflightIndex ??= refreshSearchIndex().finally(() => { inflightIndex = null; });
      index = await inflightIndex;
    }
    if (!index) {
      console.warn('Search index not built yet; answering from names and categories');
      return { index: null, status: 'building' };
    }
    return { index, status: 'ready' };
  } catch (error) {
    if (searchIndex) {
      console.warn('Search index refresh failed, keeping the loaded build:', error.message);
      indexCheckedAt = Date.now();
      return { index: searchIndex.index, status: 'ready' };
    }
    console.error('Hybrid search error:', error.message);
    return { index: null, status: 'unavailable' };
  }
}

function hybridSearch(index, query, embedding, isVisible, userState) {
  try {
    const ranked = rankHybrid(index, { query, embedding, isVisible, userState: userState || null });
    console.log(JSON.stringify({
      event: 'score_breakdown', query, scoreThreshold: ranked.threshold, terms: ranked.terms, queryState: ranked.queryState,
      accepted: ranked.accepted.slice(0, 10).map(({ name, score, bm25, semantic }) => ({
        name, combined: score, bm25: Math.round(bm25 * 1000) / 1000, semantic: Math.round(semantic * 1000) / 1000,
      })),
      acceptedCount: ranked.accepted.length, rejectedCount: ranked.rejected,
    }));
    return ranked.accepted.slice(0, MAX_RESULTS).map(({ name, score, reason }) => ({ name, score, source: 'hybrid', reason }));
  } catch (error) {
    console.error('Hybrid search error:', error.message);
    return [];
  }
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}
