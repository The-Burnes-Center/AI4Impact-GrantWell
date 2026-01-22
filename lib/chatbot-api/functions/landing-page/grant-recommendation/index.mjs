/**
 * Grant Recommendation Lambda Function
 * 
 * This function analyzes user queries to find grants matching their criteria
 * by searching through the Bedrock Knowledge Base using RAG (Retrieval-Augmented Generation).
 * 
 * ASYNC PATTERN:
 * 1. Returns filtered grants (category/agency) immediately
 * 2. Starts async RAG search in background
 * 3. Frontend polls for RAG results
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { BedrockAgentRuntimeClient, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { DynamoDBClient, ScanCommand, GetItemCommand, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { LambdaClient, InvokeCommand as LambdaInvokeCommand } from '@aws-sdk/client-lambda';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { randomUUID } from 'crypto';

const s3Client = new S3Client({ region: 'us-east-1' });
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
const kbClient = new BedrockAgentRuntimeClient({ region: 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const lambdaClient = new LambdaClient({ region: 'us-east-1' });

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
 * Supports two modes:
 * 1. Initial search: Returns filtered grants immediately + starts async RAG
 * 2. RAG search (async invocation): Performs RAG search and updates job status
 */
export const handler = async (event) => {
  try {
    console.log('Event received:', JSON.stringify(event));
    
    // Check if this is an async RAG search invocation
    if (event.asyncRagSearch) {
      return await handleAsyncRagSearch(event);
    }
    
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
    
    // Generate a unique job ID for this search
    const jobId = randomUUID();
    console.log(`[Job ${jobId}] Starting grant recommendation search for query: "${query}"`);
    
    // PHASE 1: Get filtered grants immediately (fast - category/agency filter)
    const { filteredGrants, filters, hasFilters } = await getFilteredGrantsImmediate(query, userPreferences);
    
    // Store initial job status in DynamoDB
    const searchJobsTable = process.env.SEARCH_JOBS_TABLE_NAME;
    if (searchJobsTable) {
      await saveJobStatus(jobId, {
        status: hasFilters ? 'partial' : 'in_progress',
        query,
        userPreferences,
        filters,
        filteredGrants: filteredGrants,
        ragGrants: [],
        ragStatus: 'pending',
        createdAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 3600 // 1 hour TTL
      });
    }
    
    // PHASE 2: Start async RAG search (if we have time, do it sync; otherwise async)
    // For now, do RAG search synchronously but with timeout protection
    let ragGrants = [];
    let ragStatus = 'pending';
    
    try {
      // Try to do RAG search within remaining time
      ragGrants = await findMatchingGrantsWithRAGOnly(query, userPreferences, filters, filteredGrants);
      ragStatus = 'completed';
      
      // Update job status
      if (searchJobsTable) {
        await saveJobStatus(jobId, {
          status: 'completed',
          ragGrants,
          ragStatus: 'completed',
          completedAt: new Date().toISOString()
        });
      }
    } catch (ragError) {
      console.error(`[Job ${jobId}] RAG search error:`, ragError.message);
      ragStatus = 'error';
      
      // Update job status with error
      if (searchJobsTable) {
        await saveJobStatus(jobId, {
          ragStatus: 'error',
          ragError: ragError.message
        });
      }
    }
    
    // Combine filtered and RAG grants
    const allGrants = [...filteredGrants, ...ragGrants];
    
    // Generate response with recommendations
    const response = await generateRecommendationResponse(query, allGrants);
    
    // Add metadata to response
    response.jobId = jobId;
    response.searchMethod = 'hybrid';
    response.toolUsed = 'search_grants_hybrid';
    response.filteredCount = filteredGrants.length;
    response.ragCount = ragGrants.length;
    response.ragStatus = ragStatus;
    response.filters = filters;
    
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
 * Handle async RAG search invocation
 */
async function handleAsyncRagSearch(event) {
  const { jobId, query, userPreferences, filters, filteredGrants } = event;
  const searchJobsTable = process.env.SEARCH_JOBS_TABLE_NAME;
  
  console.log(`[Async RAG] Starting for job ${jobId}`);
  
  try {
    // Update status to in_progress
    if (searchJobsTable) {
      await saveJobStatus(jobId, { ragStatus: 'in_progress' });
    }
    
    // Perform RAG search
    const ragGrants = await findMatchingGrantsWithRAGOnly(query, userPreferences, filters, filteredGrants || []);
    
    // Update job with RAG results
    if (searchJobsTable) {
      await saveJobStatus(jobId, {
        status: 'completed',
        ragGrants,
        ragStatus: 'completed',
        completedAt: new Date().toISOString()
      });
    }
    
    console.log(`[Async RAG] Completed for job ${jobId}, found ${ragGrants.length} RAG grants`);
    
    return { success: true, ragGrantsCount: ragGrants.length };
  } catch (error) {
    console.error(`[Async RAG] Error for job ${jobId}:`, error);
    
    if (searchJobsTable) {
      await saveJobStatus(jobId, {
        ragStatus: 'error',
        ragError: error.message
      });
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Save or update job status in DynamoDB
 */
async function saveJobStatus(jobId, data) {
  const tableName = process.env.SEARCH_JOBS_TABLE_NAME;
  if (!tableName) return;
  
  try {
    // For initial save, use PutItem; for updates, use UpdateItem
    if (data.createdAt) {
      // Initial save
      const command = new PutItemCommand({
        TableName: tableName,
        Item: marshall({
          jobId,
          ...data
        }, { removeUndefinedValues: true })
      });
      await dynamoClient.send(command);
    } else {
      // Update existing job
      const updateExpressions = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};
      
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) {
          updateExpressions.push(`#${key} = :${key}`);
          expressionAttributeNames[`#${key}`] = key;
          expressionAttributeValues[`:${key}`] = value;
        }
      });
      
      if (updateExpressions.length > 0) {
        const command = new UpdateItemCommand({
          TableName: tableName,
          Key: marshall({ jobId }),
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: marshall(expressionAttributeValues, { removeUndefinedValues: true })
        });
        await dynamoClient.send(command);
      }
    }
  } catch (error) {
    console.error(`Error saving job status for ${jobId}:`, error);
  }
}

/**
 * Get filtered grants immediately (category/agency/name match - fast path)
 * NO LLM scoring - just return grants that match the filter immediately
 * 
 * Searches for:
 * 1. Grants matching detected category
 * 2. Grants matching detected agency  
 * 3. Grants where NOFO name contains the search term
 * 
 * All results are combined (union) with duplicates removed
 */
async function getFilteredGrantsImmediate(query, userPreferences = {}) {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  const enableDynamoDBCache = process.env.ENABLE_DYNAMODB_CACHE === 'true';
  
  console.log(`\n========== IMMEDIATE FILTER SEARCH ==========`);
  console.log(`[Search Query] "${query}"`);
  
  // Detect if query matches agency/category
  let detectedFilters = { agency: null, category: null };
  if (enableDynamoDBCache && tableName && query) {
    if (!userPreferences.category && !userPreferences.agency) {
      detectedFilters = await detectFilterType(query, tableName);
    }
  }
  
  const filters = {
    category: userPreferences.category || detectedFilters.category,
    agency: userPreferences.agency || detectedFilters.agency
  };
  
  // Combine and deduplicate - keep all from category, agency, AND name matches
  // ALL filters use DynamoDB directly (not KB) for accurate category/agency matching
  const grantMap = new Map();
  
  // 1. Get grants matching category from DynamoDB
  if (filters.category && tableName) {
    console.log(`[Category Filter] Searching DynamoDB for category="${filters.category}"`);
    const categoryMatches = await searchGrantsByCategory(filters.category, tableName);
    
    for (const match of categoryMatches) {
      if (!grantMap.has(match.grantId)) {
        grantMap.set(match.grantId, { 
          grantId: match.grantId, 
          score: 1.0, 
          source: 'category', 
          matchReason: `Category: ${filters.category}`,
          grantName: match.grantName,
          grantType: match.grantType || 'federal'
        });
      }
    }
    console.log(`[Category Filter] Found ${categoryMatches.length} grants with category="${filters.category}"`);
  }
  
  // 2. Get grants matching agency from DynamoDB
  if (filters.agency && tableName) {
    console.log(`[Agency Filter] Searching DynamoDB for agency="${filters.agency}"`);
    const agencyMatches = await searchGrantsByAgency(filters.agency, tableName);
    
    for (const match of agencyMatches) {
      if (!grantMap.has(match.grantId)) {
        grantMap.set(match.grantId, { 
          grantId: match.grantId, 
          score: 1.0, 
          source: 'agency', 
          matchReason: `Agency: ${filters.agency}`,
          grantName: match.grantName,
          grantType: match.grantType || 'federal'
        });
      }
    }
    console.log(`[Agency Filter] Found ${agencyMatches.length} grants with agency="${filters.agency}"`);
  }
  
  // 3. Get grants where NOFO name contains the search term (scan DynamoDB)
  if (tableName && query && query.length >= 3) {
    console.log(`[Name Search] Searching DynamoDB for names containing "${query}"`);
    const nameMatches = await searchGrantsByName(query, tableName);
    
    for (const match of nameMatches) {
      if (!grantMap.has(match.grantId)) {
        grantMap.set(match.grantId, { 
          grantId: match.grantId, 
          score: 0.9, // High score for name match
          source: 'name_match', 
          matchReason: `Name contains "${query}"`,
          grantName: match.grantName,
          grantType: match.grantType || 'federal'
        });
      }
    }
    console.log(`[Name Search] Found ${nameMatches.length} grants with name containing "${query}"`);
  }
  
  const uniqueGrantIds = Array.from(grantMap.keys());
  const hasResults = uniqueGrantIds.length > 0;
  
  console.log(`[Immediate Filter] Found ${uniqueGrantIds.length} unique grants total`);
  
  if (!hasResults) {
    console.log(`[Immediate Filter] No immediate results found`);
    return { filteredGrants: [], filters, hasFilters: false };
  }
  
  // Log each grant found
  uniqueGrantIds.forEach((grantId, idx) => {
    const info = grantMap.get(grantId);
    console.log(`  ${idx + 1}. ${grantId} | Source: ${info.source} | Reason: ${info.matchReason}`);
  });
  
  // Fetch summary info for each grant - NO LLM SCORING (they match the filter, show them all!)
  const enhancedFilteredGrants = [];
  for (const grantId of uniqueGrantIds) {
    try {
      const info = grantMap.get(grantId);
      const summary = await getSummaryFile(grantId);
      
      if (summary && summary.status !== 'archived') {
        enhancedFilteredGrants.push({
          id: grantId,
          name: summary?.GrantName || info.grantName || grantId,
          matchScore: 100, // They match the filter exactly, so 100% match
          matchReason: info.matchReason,
          eligibilityMatch: true,
          fundingAmount: summary?.FundingAmount || 'Not specified',
          deadline: summary?.ApplicationDeadline || 'Not specified',
          keyRequirements: [],
          summaryUrl: grantId,
          source: 'db_filter',
          grantType: info.grantType || summary?.grant_type || 'federal'
        });
      }
    } catch (err) {
      console.warn(`Error fetching summary for grant ${grantId}:`, err.message);
    }
  }
  
  console.log(`[Immediate Filter] Returning ${enhancedFilteredGrants.length} grants (no LLM scoring - direct match)`);
  
  return { 
    filteredGrants: enhancedFilteredGrants, 
    filters, 
    hasFilters: true 
  };
}

/**
 * Search DynamoDB for grants matching a specific category
 * Returns all grants with that category from DynamoDB
 */
async function searchGrantsByCategory(category, tableName) {
  if (!category || !tableName) return [];
  
  try {
    // Use a scan with filter expression for category
    const command = new ScanCommand({
      TableName: tableName,
      FilterExpression: 'category = :cat',
      ExpressionAttributeValues: marshall({ ':cat': category }),
      ProjectionExpression: 'nofo_name, grant_name, category, agency, grant_type'
    });
    
    const response = await dynamoClient.send(command);
    const matches = [];
    
    (response.Items || []).forEach(item => {
      const unmarshalled = unmarshall(item);
      const nofoName = unmarshalled.nofo_name || '';
      const grantName = unmarshalled.grant_name || nofoName;
      
      matches.push({
        grantId: nofoName,
        grantName: grantName,
        category: unmarshalled.category,
        agency: unmarshalled.agency,
        grantType: unmarshalled.grant_type || 'federal'
      });
    });
    
    console.log(`  [DynamoDB Category Search] Found ${matches.length} grants with category="${category}"`);
    return matches;
  } catch (error) {
    console.warn('Error searching grants by category:', error.message);
    return [];
  }
}

/**
 * Search DynamoDB for grants matching a specific agency
 * Returns all grants with that agency from DynamoDB
 */
async function searchGrantsByAgency(agency, tableName) {
  if (!agency || !tableName) return [];
  
  try {
    // Use a scan with filter expression for agency
    const command = new ScanCommand({
      TableName: tableName,
      FilterExpression: 'agency = :ag',
      ExpressionAttributeValues: marshall({ ':ag': agency }),
      ProjectionExpression: 'nofo_name, grant_name, category, agency, grant_type'
    });
    
    const response = await dynamoClient.send(command);
    const matches = [];
    
    (response.Items || []).forEach(item => {
      const unmarshalled = unmarshall(item);
      const nofoName = unmarshalled.nofo_name || '';
      const grantName = unmarshalled.grant_name || nofoName;
      
      matches.push({
        grantId: nofoName,
        grantName: grantName,
        category: unmarshalled.category,
        agency: unmarshalled.agency,
        grantType: unmarshalled.grant_type || 'federal'
      });
    });
    
    console.log(`  [DynamoDB Agency Search] Found ${matches.length} grants with agency="${agency}"`);
    return matches;
  } catch (error) {
    console.warn('Error searching grants by agency:', error.message);
    return [];
  }
}

/**
 * Search DynamoDB for grants where the name contains the search term
 * Returns grants with their category/agency/grantType info
 */
async function searchGrantsByName(searchTerm, tableName) {
  if (!searchTerm || !tableName) return [];
  
  const normalizedSearch = searchTerm.trim().toLowerCase();
  
  try {
    // Scan DynamoDB for grants - include category, agency, and grant_type
    const command = new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'nofo_name, grant_name, category, agency, grant_type'
    });
    
    const response = await dynamoClient.send(command);
    const matches = [];
    
    (response.Items || []).forEach(item => {
      const unmarshalled = unmarshall(item);
      const nofoName = unmarshalled.nofo_name || '';
      const grantName = unmarshalled.grant_name || nofoName;
      const category = unmarshalled.category || null;
      const agency = unmarshalled.agency || null;
      const grantType = unmarshalled.grant_type || 'federal';
      
      // Check if name contains the search term (case-insensitive)
      if (nofoName.toLowerCase().includes(normalizedSearch) || 
          grantName.toLowerCase().includes(normalizedSearch)) {
        console.log(`  [Name Match] ${grantName} | Category: ${category || 'blank'} | Agency: ${agency || 'blank'} | Type: ${grantType}`);
        matches.push({
          grantId: nofoName,
          grantName: grantName,
          category: category,
          agency: agency,
          grantType: grantType
        });
      }
    });
    
    return matches;
  } catch (error) {
    console.warn('Error searching grants by name:', error.message);
    return [];
  }
}

/**
 * Find additional grants using RAG semantic search
 * Excludes grants already found via category/agency filters
 * Only returns NEW grants not already displayed
 * When category/agency filters are active, also excludes grants with blank metadata
 */
async function findMatchingGrantsWithRAGOnly(query, userPreferences = {}, filters = {}, existingGrants = []) {
  console.log(`\n========== RAG SEMANTIC SEARCH ==========`);
  console.log(`[RAG Search] Query: "${query}"`);
  console.log(`[RAG Search] Already displayed: ${existingGrants.length} grants`);
  
  const existingGrantIds = new Set(existingGrants.map(g => g.id || g.grantId));
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  const hasActiveFilter = !!(filters.category || filters.agency);
  
  // Log which grants are already displayed
  if (existingGrantIds.size > 0) {
    console.log(`[RAG Search] Excluding these grants (already shown):`);
    existingGrants.forEach((g, idx) => {
      console.log(`  ${idx + 1}. ${g.id || g.grantId}`);
    });
  }
  
  if (hasActiveFilter) {
    console.log(`[RAG Search] Active filters: category="${filters.category || 'none'}", agency="${filters.agency || 'none'}"`);
    console.log(`[RAG Search] Will exclude grants with blank/null category or agency`);
  }
  
  // Get RAG results (unfiltered semantic search with the query term)
  const ragResults = await retrieveFromKnowledgeBase(query, null);
  console.log(`[RAG Search] Retrieved ${ragResults.length} chunks from KB`);
  
  // Find NEW grants only (not already displayed)
  const newGrantMap = new Map();
  let skippedAlreadyShown = 0;
  let skippedBlankMetadata = 0;
  
  for (const result of ragResults) {
    const grantId = extractGrantIdFromResult(result);
    if (!grantId) continue;
    
    // Skip if already displayed from filter results
    if (existingGrantIds.has(grantId)) {
      skippedAlreadyShown++;
      continue;
    }
    
    // If filters are active, check for blank metadata and skip those
    if (hasActiveFilter && tableName) {
      const hasBlankMetadata = await checkIfGrantHasBlankMetadata(grantId, filters, tableName);
      if (hasBlankMetadata) {
        skippedBlankMetadata++;
        console.log(`  Skipped ${grantId} - blank/null metadata for active filter`);
        continue;
      }
    }
    
    // Keep highest score for each new grant
    if (!newGrantMap.has(grantId) || result.score > newGrantMap.get(grantId).score) {
      newGrantMap.set(grantId, { grantId, score: result.score });
    }
  }
  
  const newGrantIds = Array.from(newGrantMap.keys());
  console.log(`[RAG Search] Found ${newGrantIds.length} NEW grants`);
  console.log(`[RAG Search] Skipped: ${skippedAlreadyShown} already displayed, ${skippedBlankMetadata} blank metadata`);
  
  if (newGrantIds.length === 0) {
    console.log(`[RAG Search] No additional grants found - done`);
    return [];
  }
  
  // Log the new grants found
  console.log(`[RAG Search] New grants from semantic search:`);
  newGrantIds.forEach((grantId, idx) => {
    const info = newGrantMap.get(grantId);
    console.log(`  ${idx + 1}. ${grantId} | RAG Score: ${info.score?.toFixed(4) || 'N/A'}`);
  });
  
  // Fetch summary info for new grants - filter by RAG score
  const MIN_RAG_SCORE = 0.5; // Minimum confidence score
  const enhancedRagGrants = [];
  
  for (const grantId of newGrantIds) {
    const info = newGrantMap.get(grantId);
    
    // Skip low confidence RAG results
    if (info.score < MIN_RAG_SCORE) {
      console.log(`  Skipped ${grantId} - RAG score ${info.score?.toFixed(4)} < ${MIN_RAG_SCORE}`);
      continue;
    }
    
    try {
      const summary = await getSummaryFile(grantId);
      if (summary && summary.status !== 'archived') {
        // Fetch grant_type from DynamoDB
        let grantType = 'federal';
        if (tableName) {
          try {
            const getCommand = new GetItemCommand({
              TableName: tableName,
              Key: marshall({ nofo_name: grantId }),
              ProjectionExpression: 'grant_type'
            });
            const dbResponse = await dynamoClient.send(getCommand);
            if (dbResponse.Item) {
              const dbItem = unmarshall(dbResponse.Item);
              grantType = dbItem.grant_type || 'federal';
              console.log(`  [RAG Grant Type] ${grantId} -> ${grantType}`);
            } else {
              console.log(`  [RAG Grant Type] ${grantId} -> not found in DynamoDB, defaulting to federal`);
            }
          } catch (dbErr) {
            console.warn(`Could not fetch grant_type for ${grantId}:`, dbErr.message);
          }
        } else {
          console.log(`  [RAG Grant Type] No table name - skipping grant_type lookup for ${grantId}`);
        }
        
        enhancedRagGrants.push({
          id: grantId,
          name: summary?.GrantName || grantId,
          matchScore: Math.round(info.score * 100), // Convert RAG score to percentage
          matchReason: `Found via semantic search for "${query}"`,
          eligibilityMatch: true,
          fundingAmount: summary?.FundingAmount || 'Not specified',
          deadline: summary?.ApplicationDeadline || 'Not specified',
          keyRequirements: [],
          summaryUrl: grantId,
          source: 'rag',
          grantType: grantType
        });
      }
    } catch (err) {
      console.warn(`Error fetching summary for RAG grant ${grantId}:`, err.message);
    }
  }
  
  console.log(`[RAG Search] Returning ${enhancedRagGrants.length} additional grants from semantic search`);
  
  return enhancedRagGrants;
}

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
    let skippedEmpty = 0;
    
    (response.Items || []).forEach(item => {
      totalItems++;
      const unmarshalled = unmarshall(item);
      if (!unmarshalled.category) {
        skippedEmpty++;
      } else {
        categories.add(unmarshalled.category);
      }
    });
    
    categoriesCache = Array.from(categories);
    categoriesCacheTimestamp = Date.now();
    console.log(`[Categories Cache] Scanned ${totalItems} items from DynamoDB`);
    console.log(`[Categories Cache] Found ${categoriesCache.length} unique categories (skipped ${skippedEmpty} empty)`);
    
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
      return !item.category; // Category is mandatory, so only check if missing
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
          numberOfResults: 40
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
 * Generate a response for the recommendation with suggested questions
 */
async function generateRecommendationResponse(query, matchingGrants) {
  // Grants are already enhanced with summary data - just format for response
  console.log(`[Response] Preparing response with ${matchingGrants.length} grants`);
  
  // Sort by source (db_filter first, then rag) and then by matchScore
  const sortedGrants = [...matchingGrants].sort((a, b) => {
    // db_filter grants come first
    if (a.source === 'db_filter' && b.source !== 'db_filter') return -1;
    if (a.source !== 'db_filter' && b.source === 'db_filter') return 1;
    // Then sort by matchScore
    return (b.matchScore || 0) - (a.matchScore || 0);
  });
  
  // Log the final grant list
  console.log(`[Response] Final grant list:`);
  sortedGrants.forEach((grant, idx) => {
    console.log(`  ${idx + 1}. ${grant.name || grant.id} | Source: ${grant.source} | Score: ${grant.matchScore}`);
  });
  
  return {
    grants: sortedGrants
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