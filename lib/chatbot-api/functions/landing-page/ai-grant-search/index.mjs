/**
 * AI Grant Search Lambda
 *
 * Hybrid search: BM25 keyword + k-NN semantic via OpenSearch Serverless,
 * combined with DynamoDB category/agency detection.
 * Single request, single response — no polling required.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall, marshall } from '@aws-sdk/util-dynamodb';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

const REGION = process.env.AWS_REGION || 'us-east-1';
const OPENSEARCH_ENDPOINT = process.env.OPENSEARCH_ENDPOINT;
const OPENSEARCH_INDEX = process.env.OPENSEARCH_INDEX;
const NOFO_METADATA_TABLE = process.env.NOFO_METADATA_TABLE_NAME;

const TITAN_MODEL_ID = 'amazon.titan-embed-text-v2:0';
const EMBEDDING_DIM = 1024;
const BM25_WEIGHT = 0.4;
const SEMANTIC_WEIGHT = 0.6;
const MAX_RESULTS = 40;
const CACHE_TTL = 5 * 60 * 1000;

const bedrockClient = new BedrockRuntimeClient({ region: REGION });
const dynamoClient = new DynamoDBClient({ region: REGION });

let ossClient;
if (OPENSEARCH_ENDPOINT) {
  ossClient = new Client({
    ...AwsSigv4Signer({
      region: REGION,
      service: 'aoss',
      getCredentials: () => defaultProvider()(),
    }),
    node: `https://${process.env.OPENSEARCH_ENDPOINT}`,
    requestTimeout: 15000,
  });
}

let agenciesCache = null;
let categoriesCache = null;
let agenciesCacheTs = null;
let categoriesCacheTs = null;

export const handler = async (event) => {
  const startTime = Date.now();
  console.log('AI Grant Search invoked');

  try {
    let body = {};
    if (event.body) {
      body = JSON.parse(event.body);
    }

    const { query } = body;

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return respond(400, { message: 'Query must be at least 2 characters' });
    }

    const trimmedQuery = query.trim();
    console.log('Search query:', { query: trimmedQuery });

    const embeddingPromise = generateEmbedding(trimmedQuery);
    const filterPromise = detectFilterType(trimmedQuery, NOFO_METADATA_TABLE);

    const [embedding, filters] = await Promise.all([embeddingPromise, filterPromise]);

    const searchPromises = [hybridSearch(trimmedQuery, embedding, MAX_RESULTS)];

    if (filters.category) {
      searchPromises.push(searchGrantsByCategory(filters.category, NOFO_METADATA_TABLE));
    }
    if (filters.agency) {
      searchPromises.push(searchGrantsByAgency(filters.agency, NOFO_METADATA_TABLE));
    }

    const searchResults = await Promise.all(searchPromises);

    const ossResults = searchResults[0] || [];
    const categoryResults = filters.category ? (searchResults[1] || []) : [];
    const agencyResults = filters.agency ? (searchResults[filters.category ? 2 : 1] || []) : [];

    const merged = mergeAndDeduplicate(ossResults, categoryResults, agencyResults, filters);

    const searchTimeMs = Date.now() - startTime;
    console.log('Search complete:', { resultCount: merged.length, searchTimeMs });

    return respond(200, {
      results: merged,
      query: trimmedQuery,
      searchTimeMs,
    });
  } catch (error) {
    console.error('AI Grant Search error:', error);
    return respond(500, { message: 'Search failed', results: [], query: '', searchTimeMs: 0 });
  }
};

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
  if (!ossClient || !OPENSEARCH_INDEX) {
    console.warn('OpenSearch not configured, skipping hybrid search');
    return [];
  }

  try {
    const [bm25Response, knnResponse] = await Promise.all([
      ossClient.search({
        index: OPENSEARCH_INDEX,
        body: {
          size: k,
          query: { match: { text_field: { query, operator: 'or' } } },
          _source: ['metadata_field'],
        },
      }),
      ossClient.search({
        index: OPENSEARCH_INDEX,
        body: {
          size: k,
          query: { knn: { vector_field: { vector, k } } },
          _source: ['metadata_field'],
        },
      }),
    ]);

    const bm25Hits = bm25Response.body?.hits?.hits || [];
    const knnHits = knnResponse.body?.hits?.hits || [];

    const bm25MaxScore = bm25Hits.length > 0 ? Math.max(...bm25Hits.map(h => h._score || 0)) : 1;

    const scoreMap = new Map();

    for (const hit of bm25Hits) {
      const name = extractNofoName(hit);
      if (!name) continue;
      const normalizedScore = bm25MaxScore > 0 ? (hit._score || 0) / bm25MaxScore : 0;
      const existing = scoreMap.get(name) || { bm25: 0, semantic: 0 };
      existing.bm25 = Math.max(existing.bm25, normalizedScore);
      scoreMap.set(name, existing);
    }

    for (const hit of knnHits) {
      const name = extractNofoName(hit);
      if (!name) continue;
      const semanticScore = Math.max(0, Math.min(1, hit._score || 0));
      const existing = scoreMap.get(name) || { bm25: 0, semantic: 0 };
      existing.semantic = Math.max(existing.semantic, semanticScore);
      scoreMap.set(name, existing);
    }

    const results = [];
    for (const [name, scores] of scoreMap) {
      const combined = (BM25_WEIGHT * scores.bm25) + (SEMANTIC_WEIGHT * scores.semantic);
      if (combined > 0.05) {
        let reason = '';
        if (scores.bm25 > 0 && scores.semantic > 0) {
          reason = 'Matched by keyword and meaning';
        } else if (scores.bm25 > 0) {
          reason = 'Matched by keyword';
        } else {
          reason = 'Matched by meaning';
        }

        results.push({ name, score: Math.round(combined * 100) / 100, source: 'hybrid', reason });
      }
    }

    results.sort((a, b) => b.score - a.score);
    console.log('Hybrid search results:', { bm25Hits: bm25Hits.length, knnHits: knnHits.length, merged: results.length });
    return results;
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

function mergeAndDeduplicate(ossResults, categoryResults, agencyResults, filters) {
  const resultMap = new Map();

  for (const r of ossResults) {
    if (!resultMap.has(r.name) || resultMap.get(r.name).score < r.score) {
      resultMap.set(r.name, r);
    }
  }

  for (const grant of categoryResults) {
    const name = grant.grantId || grant.nofo_name || '';
    if (!name) continue;
    if (!resultMap.has(name)) {
      resultMap.set(name, {
        name,
        score: 1.0,
        source: 'category',
        reason: `Category: ${filters.category}`,
      });
    }
  }

  for (const grant of agencyResults) {
    const name = grant.grantId || grant.nofo_name || '';
    if (!name) continue;
    if (!resultMap.has(name)) {
      resultMap.set(name, {
        name,
        score: 1.0,
        source: 'agency',
        reason: `Agency: ${filters.agency}`,
      });
    }
  }

  const results = Array.from(resultMap.values());
  results.sort((a, b) => b.score - a.score);
  return results;
}

async function detectFilterType(searchTerm, tableName) {
  if (!searchTerm || !tableName) {
    return { agency: null, category: null };
  }

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const [agencies, categories] = await Promise.all([
    getAllAgencies(tableName),
    getAllCategories(tableName),
  ]);

  let matchedAgency = agencies.find(a => a.toLowerCase() === normalizedSearch);
  let matchedCategory = categories.find(c => c.toLowerCase() === normalizedSearch);

  if (!matchedAgency) {
    matchedAgency = agencies.find(a => {
      const n = a.toLowerCase();
      return n.includes(normalizedSearch) || normalizedSearch.includes(n);
    });
  }

  if (!matchedCategory) {
    matchedCategory = categories.find(c => {
      const n = c.toLowerCase();
      return n.includes(normalizedSearch) || normalizedSearch.includes(n);
    });
  }

  if (matchedAgency || matchedCategory) {
    console.log('Filter detected:', { agency: matchedAgency || null, category: matchedCategory || null });
  }

  return { agency: matchedAgency || null, category: matchedCategory || null };
}

async function getAllAgencies(tableName) {
  if (agenciesCache && agenciesCacheTs && (Date.now() - agenciesCacheTs) < CACHE_TTL) {
    return agenciesCache;
  }
  if (!tableName) return [];

  try {
    const response = await dynamoClient.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'agency',
    }));

    const agencies = new Set();
    for (const item of (response.Items || [])) {
      const u = unmarshall(item);
      if (u.agency && u.agency !== 'Unknown') agencies.add(u.agency);
    }

    agenciesCache = Array.from(agencies);
    agenciesCacheTs = Date.now();
    return agenciesCache;
  } catch (error) {
    console.error('Error fetching agencies:', error.message);
    return [];
  }
}

async function getAllCategories(tableName) {
  if (categoriesCache && categoriesCacheTs && (Date.now() - categoriesCacheTs) < CACHE_TTL) {
    return categoriesCache;
  }
  if (!tableName) return [];

  try {
    const response = await dynamoClient.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'category',
    }));

    const categories = new Set();
    for (const item of (response.Items || [])) {
      const u = unmarshall(item);
      if (u.category) categories.add(u.category);
    }

    categoriesCache = Array.from(categories);
    categoriesCacheTs = Date.now();
    return categoriesCache;
  } catch (error) {
    console.error('Error fetching categories:', error.message);
    return [];
  }
}

async function searchGrantsByCategory(category, tableName) {
  if (!category || !tableName) return [];

  try {
    const response = await dynamoClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: 'category = :cat',
      ExpressionAttributeValues: marshall({ ':cat': category }),
      ProjectionExpression: 'nofo_name, grant_name, category, agency',
    }));

    return (response.Items || []).map(item => {
      const u = unmarshall(item);
      return { grantId: u.nofo_name || '', grantName: u.grant_name || u.nofo_name || '' };
    });
  } catch (error) {
    console.error('Error searching by category:', error.message);
    return [];
  }
}

async function searchGrantsByAgency(agency, tableName) {
  if (!agency || !tableName) return [];

  try {
    const response = await dynamoClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: 'agency = :ag',
      ExpressionAttributeValues: marshall({ ':ag': agency }),
      ProjectionExpression: 'nofo_name, grant_name, category, agency',
    }));

    return (response.Items || []).map(item => {
      const u = unmarshall(item);
      return { grantId: u.nofo_name || '', grantName: u.grant_name || u.nofo_name || '' };
    });
  } catch (error) {
    console.error('Error searching by agency:', error.message);
    return [];
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
