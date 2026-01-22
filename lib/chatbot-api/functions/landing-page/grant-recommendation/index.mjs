/**
 * Grant Recommendation Lambda Function
 * 
 * This function analyzes user queries to find grants matching their criteria
 * by searching through the Bedrock Knowledge Base using RAG (Retrieval-Augmented Generation).
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { BedrockAgentRuntimeClient, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { DynamoDBClient, ScanCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const s3Client = new S3Client({ region: 'us-east-1' });
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
const kbClient = new BedrockAgentRuntimeClient({ region: 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

// Cache for agencies and categories (to avoid scanning DynamoDB on every request)
let agenciesCache = null;
let categoriesCache = null;
let agenciesCacheTimestamp = null;
let categoriesCacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Define model IDs
const CLAUDE_MODEL_ID = 'us.anthropic.claude-sonnet-4-20250514-v1:0';

/**
 * Main handler function for grant recommendation
 */
export const handler = async (event) => {
  try {
    console.log('Event received:', JSON.stringify(event));
    
    // Parse the incoming request
    let body = {};
    if (event.body) {
      body = JSON.parse(event.body);
    }
    
    const { query, userPreferences } = body;
    
    if (!query) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Query is required' })
      };
    }
    
    // Always use RAG search for all queries
    console.log('Using RAG search for query:', query);
    const matchingGrants = await findMatchingGrantsWithKB(query, userPreferences);
    
    // Generate response with recommendations
    const response = await generateRecommendationResponse(query, matchingGrants);
    
    // Add search method/tool used to response for monitoring
    response.searchMethod = 'rag';
    response.toolUsed = 'search_grants_with_rag';
    
    return {
      statusCode: 200,
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error('Error processing grant recommendation:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process grant recommendations' })
    };
  }
};

/**
 * Get all unique agencies from DynamoDB (with caching)
 */
async function getAllAgencies(tableName) {
  // Check cache
  if (agenciesCache && agenciesCacheTimestamp && (Date.now() - agenciesCacheTimestamp) < CACHE_TTL) {
    const cacheAge = Math.round((Date.now() - agenciesCacheTimestamp) / 1000);
    console.log(`[Agencies Cache] Using cached agencies (${agenciesCache.length} agencies, cache age: ${cacheAge}s)`);
    return agenciesCache;
  }
  
  if (!tableName) {
    console.log(`[Agencies Cache] No table name provided - returning empty list`);
    return [];
  }
  
  console.log(`[Agencies Cache] Cache miss or expired - fetching from DynamoDB table: ${tableName}`);
  
  try {
    const command = new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'agency'
    });
    
    const response = await dynamoClient.send(command);
    const agencies = new Set();
    let totalItems = 0;
    let skippedUnknown = 0;
    let skippedEmpty = 0;
    
    (response.Items || []).forEach(item => {
      totalItems++;
      const unmarshalled = unmarshall(item);
      if (!unmarshalled.agency) {
        skippedEmpty++;
      } else if (unmarshalled.agency === 'Unknown') {
        skippedUnknown++;
      } else {
        agencies.add(unmarshalled.agency);
      }
    });
    
    agenciesCache = Array.from(agencies);
    agenciesCacheTimestamp = Date.now();
    console.log(`[Agencies Cache] Scanned ${totalItems} items from DynamoDB`);
    console.log(`[Agencies Cache] Found ${agenciesCache.length} unique agencies (skipped ${skippedEmpty} empty, ${skippedUnknown} 'Unknown')`);
    
    return agenciesCache;
  } catch (error) {
    console.error(`[Agencies Cache] Error fetching from DynamoDB: ${error.message}`);
    return [];
  }
}

/**
 * Get all unique categories from DynamoDB (with caching)
 */
async function getAllCategories(tableName) {
  // Check cache
  if (categoriesCache && categoriesCacheTimestamp && (Date.now() - categoriesCacheTimestamp) < CACHE_TTL) {
    const cacheAge = Math.round((Date.now() - categoriesCacheTimestamp) / 1000);
    console.log(`[Categories Cache] Using cached categories (${categoriesCache.length} categories, cache age: ${cacheAge}s)`);
    return categoriesCache;
  }
  
  if (!tableName) {
    console.log(`[Categories Cache] No table name provided - returning empty list`);
    return [];
  }
  
  console.log(`[Categories Cache] Cache miss or expired - fetching from DynamoDB table: ${tableName}`);
  
  try {
    const command = new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'category'
    });
    
    const response = await dynamoClient.send(command);
    const categories = new Set();
    let totalItems = 0;
    let skippedOther = 0;
    let skippedEmpty = 0;
    
    (response.Items || []).forEach(item => {
      totalItems++;
      const unmarshalled = unmarshall(item);
      if (!unmarshalled.category) {
        skippedEmpty++;
      } else if (unmarshalled.category === 'Other') {
        skippedOther++;
      } else {
        categories.add(unmarshalled.category);
      }
    });
    
    categoriesCache = Array.from(categories);
    categoriesCacheTimestamp = Date.now();
    console.log(`[Categories Cache] Scanned ${totalItems} items from DynamoDB`);
    console.log(`[Categories Cache] Found ${categoriesCache.length} unique categories (skipped ${skippedEmpty} empty, ${skippedOther} 'Other')`);
    
    return categoriesCache;
  } catch (error) {
    console.error(`[Categories Cache] Error fetching from DynamoDB: ${error.message}`);
    return [];
  }
}

/**
 * Detect if search term matches an agency or category
 * Returns: { agency: matchedAgency | null, category: matchedCategory | null }
 */
async function detectFilterType(searchTerm, tableName) {
  console.log(`[Filter Detection] Attempting to detect filters for search term: "${searchTerm}"`);
  
  if (!searchTerm || !tableName) {
    console.log(`[Filter Detection] Skipped - missing searchTerm or tableName`);
    return { agency: null, category: null };
  }
  
  const normalizedSearch = searchTerm.trim().toLowerCase();
  console.log(`[Filter Detection] Normalized search term: "${normalizedSearch}"`);
  
  // Get all agencies and categories
  const [agencies, categories] = await Promise.all([
    getAllAgencies(tableName),
    getAllCategories(tableName)
  ]);
  
  // Debug: Log available agencies and categories
  console.log(`[Filter Detection] Available agencies (${agencies.length}):`);
  if (agencies.length > 0) {
    agencies.forEach((agency, idx) => {
      console.log(`  ${idx + 1}. "${agency}"`);
    });
  } else {
    console.log(`  (none found in DynamoDB)`);
  }
  
  console.log(`[Filter Detection] Available categories (${categories.length}):`);
  if (categories.length > 0) {
    categories.forEach((category, idx) => {
      console.log(`  ${idx + 1}. "${category}"`);
    });
  } else {
    console.log(`  (none found in DynamoDB)`);
  }
  
  // Check for exact match first (case-insensitive)
  let matchedAgency = agencies.find(a => 
    a.toLowerCase() === normalizedSearch
  );
  
  let matchedCategory = categories.find(c => 
    c.toLowerCase() === normalizedSearch
  );
  
  // Log exact match results
  if (matchedAgency) {
    console.log(`[Filter Detection] Exact agency match found: "${matchedAgency}"`);
  }
  if (matchedCategory) {
    console.log(`[Filter Detection] Exact category match found: "${matchedCategory}"`);
  }
  
  // If no exact match, try partial matching
  if (!matchedAgency) {
    matchedAgency = agencies.find(a => {
      const normalizedAgency = a.toLowerCase();
      return normalizedAgency.includes(normalizedSearch) || 
             normalizedSearch.includes(normalizedAgency);
    });
    if (matchedAgency) {
      console.log(`[Filter Detection] Partial agency match found: "${matchedAgency}" (search: "${normalizedSearch}")`);
    }
  }
  
  if (!matchedCategory) {
    matchedCategory = categories.find(c => {
      const normalizedCategory = c.toLowerCase();
      return normalizedCategory.includes(normalizedSearch) || 
             normalizedSearch.includes(normalizedCategory);
    });
    if (matchedCategory) {
      console.log(`[Filter Detection] Partial category match found: "${matchedCategory}" (search: "${normalizedSearch}")`);
    }
  }
  
  // Final result logging
  if (!matchedAgency && !matchedCategory) {
    console.log(`[Filter Detection] No matches found for "${searchTerm}" in agencies or categories`);
  } else {
    console.log(`[Filter Detection] Final result - Agency: ${matchedAgency || 'null'}, Category: ${matchedCategory || 'null'}`);
  }
  
  return {
    agency: matchedAgency || null,
    category: matchedCategory || null
  };
}

/**
 * Find grants that match the user's query using hybrid search (metadata filtering + RAG + keyword matching)
 * Returns: All grants matching category OR agency filter (union) PLUS any additional grants found by RAG
 * DB-matched grants are included regardless of score; score filtering only applies to RAG results
 */
async function findMatchingGrantsWithKB(query, userPreferences = {}) {
  try {
    console.log(`\n========== GRANT RECOMMENDATION SEARCH ==========`);
    console.log(`[Search Query] "${query}"`);
    console.log(`[User Preferences] ${JSON.stringify(userPreferences)}`);
    
    // Auto-detect if query term matches an agency or category
    const tableName = process.env.NOFO_METADATA_TABLE_NAME;
    const enableDynamoDBCache = process.env.ENABLE_DYNAMODB_CACHE === 'true';
    
    // Debug: Log environment variable status
    console.log(`[Environment] NOFO_METADATA_TABLE_NAME: ${tableName || '(not set)'}`);
    console.log(`[Environment] ENABLE_DYNAMODB_CACHE: ${process.env.ENABLE_DYNAMODB_CACHE || '(not set)'} (parsed as: ${enableDynamoDBCache})`);
    
    let detectedFilters = { agency: null, category: null };
    if (enableDynamoDBCache && tableName && query) {
      // Only detect if no explicit filters are set (explicit takes precedence)
      if (!userPreferences.category && !userPreferences.agency) {
        detectedFilters = await detectFilterType(query, tableName);
      }
    }
    
    // Extract filters: explicit preferences take precedence over auto-detected
    const filters = {
      category: userPreferences.category || detectedFilters.category,
      agency: userPreferences.agency || detectedFilters.agency,
      keywords: extractKeywords(query)
    };
    
    // 1. Get filtered grants - SEPARATE queries for category and agency (union, not AND)
    let categoryResults = [];
    let agencyResults = [];
    
    if (filters.category) {
      const categoryFilter = buildKBMetadataFilter({ category: filters.category });
      categoryResults = await retrieveFromKnowledgeBase(query, categoryFilter);
      console.log(`[Category Filter] Retrieved ${categoryResults.length} chunks matching category="${filters.category}"`);
    }
    
    if (filters.agency) {
      const agencyFilter = buildKBMetadataFilter({ agency: filters.agency });
      agencyResults = await retrieveFromKnowledgeBase(query, agencyFilter);
      console.log(`[Agency Filter] Retrieved ${agencyResults.length} chunks matching agency="${filters.agency}"`);
    }
    
    if (!filters.category && !filters.agency) {
      console.log(`[Filtered Search] No filters applied - skipping filtered search`);
    }
    
    // 2. Get RAG results (unfiltered semantic search)
    const ragResults = await retrieveFromKnowledgeBase(query, null);
    console.log(`[RAG Search] Retrieved ${ragResults.length} chunks from semantic search (unfiltered)`);
    
    // 3. Combine category + agency results (union), then add RAG results
    // Track grant sources: DB-matched grants are included regardless of score
    const { combinedResults, grantSources, stats } = await combineFilteredAndRagResults(
      categoryResults,
      agencyResults, 
      ragResults, 
      filters,
      enableDynamoDBCache ? tableName : null
    );
    
    // Log detailed statistics
    console.log(`[Combined Results] Summary:`);
    console.log(`  - Grants from category filter: ${stats.fromCategory} unique grants`);
    console.log(`  - Grants from agency filter: ${stats.fromAgency} unique grants`);
    console.log(`  - Grants from both filters (duplicates removed): ${stats.duplicatesBetweenFilters}`);
    console.log(`  - Grants from RAG search only: ${stats.fromRAGOnly} unique grants`);
    console.log(`  - Grants skipped (blank metadata): ${stats.skippedBlankMetadata}`);
    console.log(`  - RAG grants excluded (already in DB results): ${stats.ragDuplicates}`);
    console.log(`  - Total unique grants: ${combinedResults.length}`);
    
    if (combinedResults.length === 0) {
      console.log('No results from Knowledge Base for query:', query);
      return [];
    }
    
    // 4. Extract grant information from the combined results, preserving source info
    const grantInfos = extractGrantInfoFromKBResultsWithSource(combinedResults, grantSources);
    console.log(`[Grant Extraction] Extracted ${grantInfos.length} unique grants from ${combinedResults.length} chunks`);
    
    // Debug: Log each extracted grant with its source and RAG score
    console.log(`[Grant Extraction Details]:`);
    grantInfos.forEach((grant, idx) => {
      console.log(`  ${idx + 1}. ${grant.grantId} | Source: ${grant.source} | RAG Score: ${grant.score?.toFixed(4) || 'N/A'}`);
    });
    
    // 5. Enhance results with keyword matching boost
    const enhancedGrants = enhanceWithKeywordMatching(grantInfos, filters.keywords);
    console.log(`[Keyword Enhancement] Enhanced ${enhancedGrants.length} grants with keyword matching`);
    
    // Debug: Log keyword enhancement details
    console.log(`[Keyword Enhancement Details]:`);
    enhancedGrants.forEach((grant, idx) => {
      console.log(`  ${idx + 1}. ${grant.grantId} | Source: ${grant.source} | RAG Score: ${grant.ragScore?.toFixed(4) || 'N/A'} | Keyword Matches: ${grant.keywordMatches || 0} | Boosted Score: ${grant.boostedScore?.toFixed(4) || 'N/A'}`);
    });
    
    // Count by source
    const dbGrants = enhancedGrants.filter(g => g.source === 'db_filter').length;
    const ragOnlyGrants = enhancedGrants.filter(g => g.source === 'rag').length;
    console.log(`[Source Breakdown] DB-matched: ${dbGrants}, RAG-only: ${ragOnlyGrants}`);
    
    // 6. Use Bedrock to analyze and score the grants against the user query
    // DB-matched grants are included regardless of score; score filtering only for RAG
    const scoredGrants = await analyzeAndScoreGrants(query, enhancedGrants, userPreferences);
    
    // Debug: Log LLM scored grants with details
    console.log(`[LLM Scoring Details]:`);
    scoredGrants.forEach((grant, idx) => {
      console.log(`  ${idx + 1}. ${grant.grantId} | Source: ${grant.source} | LLM Match Score: ${grant.matchScore} | Eligibility: ${grant.eligibilityMatch ? 'Yes' : 'No'}`);
      console.log(`      Reason: ${grant.matchReason?.substring(0, 100)}${grant.matchReason?.length > 100 ? '...' : ''}`);
    });
    
    // Count final results by source
    const finalDbGrants = scoredGrants.filter(g => g.source === 'db_filter').length;
    const finalRagGrants = scoredGrants.filter(g => g.source === 'rag').length;
    console.log(`[LLM Scoring] Final grants: ${scoredGrants.length} total (${finalDbGrants} DB-matched always included, ${finalRagGrants} RAG with score >= 80)`);
    
    return scoredGrants;
  } catch (error) {
    console.error('Error finding matching grants with KB:', error);
    return [];
  }
}

/**
 * Combine category results, agency results, and RAG results
 * Category + Agency are combined as UNION (not AND), then RAG adds additional results
 * Tracks grant sources: 'db_filter' for category/agency, 'rag' for RAG-only
 * RAG results are excluded if already found via DB filters
 */
async function combineFilteredAndRagResults(categoryResults, agencyResults, ragResults, activeFilters = {}, tableName = null) {
  const grantMap = new Map();
  const grantSources = new Map(); // Track source: 'db_filter' or 'rag'
  const stats = {
    fromCategory: 0,
    fromAgency: 0,
    duplicatesBetweenFilters: 0,
    fromRAGOnly: 0,
    skippedBlankMetadata: 0,
    ragDuplicates: 0
  };
  
  // Track unique grant IDs from each filter type
  const categoryGrantIds = new Set();
  const agencyGrantIds = new Set();
  const dbFilterGrantIds = new Set(); // All grants from DB filters
  
  // 1. Add category results (guaranteed matches for category filter)
  for (const result of categoryResults) {
    const grantId = extractGrantIdFromResult(result);
    if (grantId) {
      categoryGrantIds.add(grantId);
      dbFilterGrantIds.add(grantId);
      grantSources.set(grantId, 'db_filter');
      // Keep the highest scoring chunk for each grant
      if (!grantMap.has(grantId) || result.score > grantMap.get(grantId).score) {
        grantMap.set(grantId, result);
      }
    }
  }
  stats.fromCategory = categoryGrantIds.size;
  
  // Debug: Log category filter grants
  if (categoryGrantIds.size > 0) {
    console.log(`[Category Filter Grants] Found ${categoryGrantIds.size} grants:`);
    Array.from(categoryGrantIds).forEach((grantId, idx) => {
      const grant = grantMap.get(grantId);
      console.log(`  ${idx + 1}. ${grantId} | Score: ${grant?.score?.toFixed(4) || 'N/A'}`);
    });
  }
  
  // 2. Add agency results (union with category - don't skip if already in category)
  for (const result of agencyResults) {
    const grantId = extractGrantIdFromResult(result);
    if (grantId) {
      agencyGrantIds.add(grantId);
      
      // Check if this grant was also in category results (duplicate between filters)
      if (categoryGrantIds.has(grantId)) {
        stats.duplicatesBetweenFilters++;
        // Update if this result has higher score
        if (result.score > grantMap.get(grantId).score) {
          grantMap.set(grantId, result);
        }
      } else {
        // New grant from agency filter
        dbFilterGrantIds.add(grantId);
        grantSources.set(grantId, 'db_filter');
        if (!grantMap.has(grantId) || result.score > grantMap.get(grantId).score) {
          grantMap.set(grantId, result);
        }
      }
    }
  }
  // Agency unique grants = total agency - duplicates with category
  stats.fromAgency = agencyGrantIds.size - stats.duplicatesBetweenFilters;
  
  // Debug: Log agency filter grants
  if (agencyGrantIds.size > 0) {
    console.log(`[Agency Filter Grants] Found ${agencyGrantIds.size} grants (${stats.duplicatesBetweenFilters} overlap with category):`);
    Array.from(agencyGrantIds).forEach((grantId, idx) => {
      const grant = grantMap.get(grantId);
      const isDuplicate = categoryGrantIds.has(grantId);
      console.log(`  ${idx + 1}. ${grantId} | Score: ${grant?.score?.toFixed(4) || 'N/A'}${isDuplicate ? ' [DUPLICATE - also in category]' : ''}`);
    });
  }
  
  // 3. Add RAG results (only if NOT already in DB filter results)
  // RAG provides additional semantic matches beyond the exact category/agency filters
  const hasActiveFilter = activeFilters.category || activeFilters.agency;
  
  for (const result of ragResults) {
    const grantId = extractGrantIdFromResult(result);
    if (!grantId) continue;
    
    // Skip if already found via DB filters (category or agency)
    if (dbFilterGrantIds.has(grantId)) {
      stats.ragDuplicates++;
      continue;
    }
    
    // If filters are active, check if grant has blank/null metadata
    if (hasActiveFilter && tableName) {
      const hasBlankMetadata = await checkIfGrantHasBlankMetadata(grantId, activeFilters, tableName);
      if (hasBlankMetadata) {
        stats.skippedBlankMetadata++;
        continue; // Skip grants with blank/null metadata when filter is active
      }
    }
    
    // Add RAG result (not in DB filter results)
    if (!grantMap.has(grantId)) {
      grantMap.set(grantId, result);
      grantSources.set(grantId, 'rag');
      stats.fromRAGOnly++;
    } else if (result.score > grantMap.get(grantId).score) {
      grantMap.set(grantId, result);
    }
  }
  
  // Debug: Log RAG-only grants (not from DB filters)
  const ragOnlyGrantIds = Array.from(grantSources.entries())
    .filter(([_, source]) => source === 'rag')
    .map(([grantId, _]) => grantId);
  
  if (ragOnlyGrantIds.length > 0) {
    console.log(`[RAG-Only Grants] Found ${ragOnlyGrantIds.length} additional grants from semantic search:`);
    ragOnlyGrantIds.forEach((grantId, idx) => {
      const grant = grantMap.get(grantId);
      console.log(`  ${idx + 1}. ${grantId} | RAG Score: ${grant?.score?.toFixed(4) || 'N/A'}`);
    });
  }
  
  // Debug: Log skipped grants
  if (stats.ragDuplicates > 0) {
    console.log(`[RAG Duplicates] ${stats.ragDuplicates} grants skipped (already found via DB filters)`);
  }
  if (stats.skippedBlankMetadata > 0) {
    console.log(`[Blank Metadata] ${stats.skippedBlankMetadata} grants skipped (blank/null metadata for active filter)`);
  }
  
  // Debug: Final combined summary
  console.log(`[Combined Total] ${grantMap.size} unique grants (${dbFilterGrantIds.size} from DB filters + ${ragOnlyGrantIds.length} from RAG)`);
  
  return {
    combinedResults: Array.from(grantMap.values()),
    grantSources,
    stats
  };
}

/**
 * Check if a grant has blank/null metadata for the active filter
 */
async function checkIfGrantHasBlankMetadata(grantId, activeFilters, tableName) {
  try {
    const command = new GetItemCommand({
      TableName: tableName,
      Key: marshall({ nofo_name: grantId })
    });
    
    const response = await dynamoClient.send(command);
    if (!response.Item) {
      // Grant not in DynamoDB - assume it might have blank metadata
      return true;
    }
    
    const item = unmarshall(response.Item);
    
    // Check if the filtered field is blank/null
    if (activeFilters.category) {
      return !item.category || item.category === 'Other' || item.category === 'Unknown';
    }
    if (activeFilters.agency) {
      return !item.agency || item.agency === 'Unknown';
    }
    
    return false;
  } catch (error) {
    console.warn(`Error checking metadata for grant ${grantId}:`, error.message);
    // On error, include the grant (fail open)
    return false;
  }
}

/**
 * Extract grant ID from KB result
 */
function extractGrantIdFromResult(result) {
  try {
    const s3Uri = result.location?.s3Location?.uri;
    if (!s3Uri) return null;
    
    const uriParts = s3Uri.split('/');
    if (uriParts.length >= 4) {
      return uriParts[3]; // Folder name = grant ID
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Build metadata filter for Bedrock KB Retrieve API
 * Supports filtering by category and agency
 */
function buildKBMetadataFilter(filters) {
  const conditions = [{
    equals: {
      key: "metadataAttributes.documentType",
      value: "NOFO"
    }
  }];
  
  // Add category filter if specified
  if (filters.category) {
    conditions.push({
      equals: {
        key: "metadataAttributes.category",
        value: filters.category
      }
    });
  }
  
  // Add agency filter if specified
  if (filters.agency) {
    conditions.push({
      equals: {
        key: "metadataAttributes.agency",
        value: filters.agency
      }
    });
  }
  
  // Return filter expression - use AND logic if multiple conditions
  return conditions.length > 1 ? { and: conditions } : conditions[0];
}

/**
 * Extract keywords from query for keyword matching
 * Removes common stop words and extracts meaningful terms
 */
function extractKeywords(query) {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 
    'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 
    'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very'
  ]);
  
  // Split query into words, convert to lowercase, remove stop words
  const words = query.toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
  
  // Return unique keywords
  return [...new Set(words)];
}

/**
 * Retrieve documents from the Bedrock Knowledge Base with optional metadata filtering
 */
async function retrieveFromKnowledgeBase(query, metadataFilter = null) {
  // Ensure KB_ID environment variable is set
  if (!process.env.KB_ID) {
    throw new Error('KB_ID environment variable is not set');
  }
  
  try {
    const input = {
      knowledgeBaseId: process.env.KB_ID,
      retrievalQuery: { 
        text: query,
        ...(metadataFilter && { filter: metadataFilter })
      },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          numberOfResults: 100 // Request more results to ensure we get good coverage
        }
      }
    };
    
    const command = new RetrieveCommand(input);
    const response = await kbClient.send(command);
    
    // Filter results by confidence score
    const confidenceFilteredResults = response.retrievalResults.filter(item => 
      item.score > 0.5 // Only include results with reasonable confidence
    );
    
    console.log(`Retrieved ${confidenceFilteredResults.length} relevant documents from KB${metadataFilter ? ' with metadata filtering' : ''}`);
    
    return confidenceFilteredResults;
  } catch (error) {
    console.error('Error retrieving from Knowledge Base:', error);
    return [];
  }
}

/**
 * Extract structured grant information from Knowledge Base results
 */
function extractGrantInfoFromKBResults(kbResults) {
  const grantMap = new Map(); // Use map to deduplicate grants
  
  for (const result of kbResults) {
    try {
      // Extract the grant identifier from the S3 location
      const s3Uri = result.location?.s3Location?.uri;
      if (!s3Uri) continue;
      
      // Extract folder name from S3 URI (assumes pattern s3://bucket/folder/file)
      const uriParts = s3Uri.split('/');
      let folderName = '';
      
      // Handle different URI patterns to extract folder name
      if (uriParts.length >= 4) {
        // Skip 's3:' and '' and 'bucket'
        folderName = uriParts[3];
      }
      
      if (!folderName) continue;
      
      // If we haven't seen this grant before, add it to our map
      if (!grantMap.has(folderName)) {
        grantMap.set(folderName, {
          grantId: folderName,
          content: [],
          score: result.score,
          ragScore: result.score // Store original RAG score
        });
      }
      
      // Add this content to the grant
      grantMap.get(folderName).content.push(result.content.text);
      
      // Keep the highest score we've seen for this grant
      if (result.score > grantMap.get(folderName).score) {
        grantMap.get(folderName).score = result.score;
        grantMap.get(folderName).ragScore = result.score;
      }
    } catch (error) {
      console.warn('Error processing KB result:', error);
    }
  }
  
  // Convert map to array
  return Array.from(grantMap.values());
}

/**
 * Extract grant info from KB results, preserving source information
 * Source: 'db_filter' for grants from category/agency filters, 'rag' for RAG-only
 * DB-filtered grants are included regardless of score; scoring applies only to RAG
 */
function extractGrantInfoFromKBResultsWithSource(kbResults, grantSources) {
  const grantMap = new Map(); // Use map to deduplicate grants
  
  for (const result of kbResults) {
    try {
      // Extract the grant identifier from the S3 location
      const s3Uri = result.location?.s3Location?.uri;
      if (!s3Uri) continue;
      
      // Extract folder name from S3 URI (assumes pattern s3://bucket/folder/file)
      const uriParts = s3Uri.split('/');
      let folderName = '';
      
      // Handle different URI patterns to extract folder name
      if (uriParts.length >= 4) {
        // Skip 's3:' and '' and 'bucket'
        folderName = uriParts[3];
      }
      
      if (!folderName) continue;
      
      // Get source from the grantSources map
      const source = grantSources.get(folderName) || 'rag';
      
      // If we haven't seen this grant before, add it to our map
      if (!grantMap.has(folderName)) {
        grantMap.set(folderName, {
          grantId: folderName,
          content: [],
          score: result.score,
          ragScore: result.score, // Store original RAG score
          source: source // 'db_filter' or 'rag'
        });
      }
      
      // Add this content to the grant
      grantMap.get(folderName).content.push(result.content.text);
      
      // Keep the highest score we've seen for this grant
      if (result.score > grantMap.get(folderName).score) {
        grantMap.get(folderName).score = result.score;
        grantMap.get(folderName).ragScore = result.score;
      }
    } catch (error) {
      console.warn('Error processing KB result:', error);
    }
  }
  
  // Convert map to array
  return Array.from(grantMap.values());
}

/**
 * Enhance results with keyword matching boost
 * Adds keyword match score to improve relevance for exact term matches
 */
function enhanceWithKeywordMatching(grantInfos, keywords) {
  if (!keywords || keywords.length === 0) {
    return grantInfos;
  }
  
  return grantInfos.map(grant => {
    let keywordScore = 0;
    const content = grant.content.join(' ').toLowerCase();
    
    // Count keyword matches in content
    keywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      // Count occurrences (simple word boundary matching)
      const matches = (content.match(new RegExp(`\\b${keywordLower}\\b`, 'gi')) || []).length;
      keywordScore += matches;
    });
    
    // Calculate keyword boost (0.1 per match, capped at 0.3 total boost)
    const keywordBoost = Math.min(keywordScore * 0.1, 0.3);
    
    // Boost RAG score if keywords match
    const boostedScore = Math.min(grant.score + keywordBoost, 1.0);
    
    return {
      ...grant,
      keywordMatches: keywordScore,
      keywordBoost: keywordBoost,
      boostedScore: boostedScore
    };
  });
}

/**
 * Analyze and score grants against the user query using Bedrock
 * DB-filtered grants are always included regardless of score
 * Score threshold (80) only applies to RAG-sourced grants
 */
async function analyzeAndScoreGrants(query, grantInfos, userPreferences) {
  // If no grants found in KB, return empty array
  if (grantInfos.length === 0) {
    return [];
  }
  
  // Build a map of grant sources for post-processing
  const grantSourceMap = new Map();
  grantInfos.forEach(grant => {
    grantSourceMap.set(grant.grantId, grant.source || 'rag');
  });
  
  // Combine the content for each grant into a single string, truncating to reduce token usage
  const MAX_CONTENT_LENGTH = 3000; // Limit each grant's content to ~3000 characters
  const grantsWithCombinedContent = grantInfos.map(grant => {
    const combinedContent = grant.content.join('\n\n');
    const truncatedContent = combinedContent.length > MAX_CONTENT_LENGTH
      ? combinedContent.substring(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated for length...]'
      : combinedContent;
    return {
      ...grant,
      combinedContent: truncatedContent,
      // Include boosted score for LLM context
      relevanceScore: grant.boostedScore || grant.score
    };
  });
  
  // Create a prompt for Bedrock to analyze the grants
  // NOTE: We ask LLM to score ALL grants; we filter by score post-LLM only for RAG grants
  const prompt = `
    # GRANT MATCHING SYSTEM

## TASK OVERVIEW
You are a specialized grant matching expert. Your task is to analyze available grants and score their relevance to the user's needs.

## INPUT DATA
<user_query>${query}</user_query>
${userPreferences ? `<user_preferences>${JSON.stringify(userPreferences)}</user_preferences>` : ''}

## AVAILABLE GRANTS DATABASE
<grants>
${grantsWithCombinedContent.map((grant, index) => `
<grant id="${grant.grantId}" source="${grant.source || 'rag'}" relevance_score="${grant.relevanceScore}" rag_score="${grant.ragScore || grant.score}" keyword_matches="${grant.keywordMatches || 0}">
${grant.combinedContent}
</grant>
`).join('\n')}
</grants>

## EVALUATION CRITERIA
For each grant in the database:
1. Analyze how well it matches the user's query and stated preferences
2. Evaluate based on:
   - Direct relevance to the user's specific project or need
   - Alignment with eligibility criteria
   - Compatibility with stated requirements
3. Calculate a match score (0-100) based on these factors
4. Return ALL grants with their scores - do not filter any out
5. If the user's query is not related to grants at all, return an empty array

## OUTPUT INSTRUCTIONS
Return a JSON array of ALL grants with their scores (do not filter by score), where each grant is represented as an object with the following structure:
  {"grantId": "exact ID as provided in the grant listing",
    "matchScore": 85, // number between 0-100
    "matchReason": "Concise explanation of why this grant matches the user's needs",
    "eligibilityMatch": true, // boolean indicating if user likely meets eligibility
    "keyRequirements": [
      "Requirement 1",
      "Requirement 2",
      "Requirement 3"
    ]},
  // Additional grants...

Return only the JSON array with no preamble, explanations, or additional text.`;
  
  const bedrockParams = {
    modelId: CLAUDE_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4000,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ]
    })
  };
  
  try {
    const command = new InvokeModelCommand(bedrockParams);
    const response = await bedrockClient.send(command);
    
    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body)
    );
    
    const content = responseBody.content[0].text;
    
    // Extract JSON from the response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const allScoredGrants = JSON.parse(jsonMatch[0]);
      
      console.log(`[LLM Raw Response] Received ${allScoredGrants.length} scored grants from LLM`);
      
      // Post-process to ensure no "Grant N" names are used
      const processedGrants = allScoredGrants.map(grant => {
        // Ensure the grantId isn't a "Grant N" format
        if (/^Grant \d+$/.test(grant.grantId)) {
          // Try to find the original grant from our input list
          const originalGrant = grantsWithCombinedContent.find(g => 
            g.combinedContent.includes(grant.keyRequirements?.[0] || '') || 
            g.combinedContent.includes(grant.matchReason || '')
          );
          
          if (originalGrant) {
            grant.grantId = originalGrant.grantId;
          }
        }
        
        // Add source info to the grant
        grant.source = grantSourceMap.get(grant.grantId) || 'rag';
        
        return grant;
      });
      
      // Debug: Log all LLM scores before filtering
      console.log(`[LLM All Scores] All grants scored by LLM:`);
      processedGrants.forEach((grant, idx) => {
        console.log(`  ${idx + 1}. ${grant.grantId} | Source: ${grant.source} | LLM Score: ${grant.matchScore} | Eligibility: ${grant.eligibilityMatch ? 'Yes' : 'No'}`);
      });
      
      // Apply score filtering: 
      // - DB-filtered grants (source='db_filter') are ALWAYS included regardless of score
      // - RAG-only grants (source='rag') must have score >= 80
      const SCORE_THRESHOLD = 80;
      const filteredGrants = processedGrants.filter(grant => {
        if (grant.source === 'db_filter') {
          // Always include DB-matched grants
          return true;
        } else {
          // Apply score threshold to RAG-only grants
          return grant.matchScore >= SCORE_THRESHOLD;
        }
      });
      
      // Log filtering stats
      const dbGrants = filteredGrants.filter(g => g.source === 'db_filter').length;
      const ragGrantsIncluded = filteredGrants.filter(g => g.source === 'rag').length;
      const ragGrantsExcluded = processedGrants.filter(g => g.source === 'rag' && g.matchScore < SCORE_THRESHOLD);
      console.log(`[Score Filtering] DB grants always included: ${dbGrants}, RAG grants (score >= ${SCORE_THRESHOLD}): ${ragGrantsIncluded}, RAG grants excluded (low score): ${ragGrantsExcluded.length}`);
      
      // Debug: Log excluded RAG grants
      if (ragGrantsExcluded.length > 0) {
        console.log(`[Excluded RAG Grants] Grants excluded due to low score (< ${SCORE_THRESHOLD}):`);
        ragGrantsExcluded.forEach((grant, idx) => {
          console.log(`  ${idx + 1}. ${grant.grantId} | LLM Score: ${grant.matchScore} | Reason: ${grant.matchReason?.substring(0, 80)}...`);
        });
      }
      
      // Sort by match score (highest first)
      return filteredGrants.sort((a, b) => b.matchScore - a.matchScore);
    } else {
      console.error('Failed to extract JSON from response:', content);
      return [];
    }
  } catch (error) {
    console.error('Error calling Bedrock for analysis:', error);
    return [];
  }
}

/**
 * Generate a response for the recommendation with suggested questions
 */
async function generateRecommendationResponse(query, matchingGrants) {
  // Enhance and filter grants - only include active NOFOs
  const enhancedGrants = [];
  let filteredOutCount = 0;
  
  // Process each matching grant - check status and enhance with summary data
  for (const grant of matchingGrants) {
    try {
      // Get the summary file for additional details and status check
      const summary = await getSummaryFile(grant.grantId);
      
      // Check if the NOFO is archived - skip it if so
      if (summary && summary.status === 'archived') {
        console.log(`Filtering out archived NOFO: ${grant.grantId}`);
        filteredOutCount++;
        continue; // Skip this grant
      }
      
      // This NOFO is active or has no status (assume active by default)
      enhancedGrants.push({
        grantId: grant.grantId,
        name: summary?.GrantName || grant.grantId,
        deadline: summary?.Deadline || 'Not specified',
        keyRequirements: grant.keyRequirements || [],
        summaryUrl: `${grant.grantId}/`,
        status: summary?.status || 'active', // Track status for debugging
        agency: summary?.Agency || null, // Include agency
        category: summary?.Category || null // Include category
      });
    } catch (error) {
      console.warn(`Error processing grant ${grant.grantId}:`, error);
      // For errors, include the grant but mark it as active (default assumption)
      enhancedGrants.push({
        grantId: grant.grantId,
        name: grant.name || grant.grantId,
        deadline: grant.deadline || 'Not specified',
        keyRequirements: grant.keyRequirements || [],
        summaryUrl: grant.summaryUrl || `${grant.grantId}/`,
        status: 'active' // Default for error cases
      });
    }
  }
  
  console.log(`Filtered out ${filteredOutCount} archived NOFOs from recommendation results`);
  console.log(`Returning ${enhancedGrants.length} active NOFOs for recommendation`);
  
  return {
    grants: enhancedGrants
  };
}

/**
 * Get the summary.json file for a specific NOFO if available
 */
async function getSummaryFile(nofoFolder) {
  const summaryPath = `${nofoFolder}/summary.json`;
  
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.BUCKET,
      Key: summaryPath
    });
    
    const response = await s3Client.send(command);
    const fileContent = await streamToString(response.Body);
    return JSON.parse(fileContent);
  } catch (error) {
    console.warn(`No summary file found for ${nofoFolder}:`, error);
    return null;
  }
}

/**
 * Helper function to convert stream to string
 */
async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}