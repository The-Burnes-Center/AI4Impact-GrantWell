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
    return agenciesCache;
  }
  
  if (!tableName) {
    return [];
  }
  
  try {
    const command = new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'agency'
    });
    
    const response = await dynamoClient.send(command);
    const agencies = new Set();
    
    (response.Items || []).forEach(item => {
      const unmarshalled = unmarshall(item);
      if (unmarshalled.agency && unmarshalled.agency !== 'Unknown') {
        agencies.add(unmarshalled.agency);
      }
    });
    
    agenciesCache = Array.from(agencies);
    cacheTimestamp = Date.now();
    console.log(`Cached ${agenciesCache.length} unique agencies`);
    
    return agenciesCache;
  } catch (error) {
    console.warn('Error fetching agencies from DynamoDB:', error.message);
    return [];
  }
}

/**
 * Get all unique categories from DynamoDB (with caching)
 */
async function getAllCategories(tableName) {
  // Check cache
  if (categoriesCache && categoriesCacheTimestamp && (Date.now() - categoriesCacheTimestamp) < CACHE_TTL) {
    return categoriesCache;
  }
  
  if (!tableName) {
    return [];
  }
  
  try {
    const command = new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'category'
    });
    
    const response = await dynamoClient.send(command);
    const categories = new Set();
    
    (response.Items || []).forEach(item => {
      const unmarshalled = unmarshall(item);
      if (unmarshalled.category && unmarshalled.category !== 'Other') {
        categories.add(unmarshalled.category);
      }
    });
    
    categoriesCache = Array.from(categories);
    categoriesCacheTimestamp = Date.now();
    console.log(`Cached ${categoriesCache.length} unique categories`);
    
    return categoriesCache;
  } catch (error) {
    console.warn('Error fetching categories from DynamoDB:', error.message);
    return [];
  }
}

/**
 * Detect if search term matches an agency or category
 * Returns: { agency: matchedAgency | null, category: matchedCategory | null }
 */
async function detectFilterType(searchTerm, tableName) {
  if (!searchTerm || !tableName) {
    return { agency: null, category: null };
  }
  
  const normalizedSearch = searchTerm.trim().toLowerCase();
  
  // Get all agencies and categories
  const [agencies, categories] = await Promise.all([
    getAllAgencies(tableName),
    getAllCategories(tableName)
  ]);
  
  // Check for exact match first (case-insensitive)
  let matchedAgency = agencies.find(a => 
    a.toLowerCase() === normalizedSearch
  );
  
  let matchedCategory = categories.find(c => 
    c.toLowerCase() === normalizedSearch
  );
  
  // If no exact match, try partial matching
  if (!matchedAgency) {
    matchedAgency = agencies.find(a => {
      const normalizedAgency = a.toLowerCase();
      return normalizedAgency.includes(normalizedSearch) || 
             normalizedSearch.includes(normalizedAgency);
    });
  }
  
  if (!matchedCategory) {
    matchedCategory = categories.find(c => {
      const normalizedCategory = c.toLowerCase();
      return normalizedCategory.includes(normalizedSearch) || 
             normalizedSearch.includes(normalizedCategory);
    });
  }
  
  // Return the original case-matched value
  if (matchedAgency) {
    console.log(`Auto-detected agency filter: "${matchedAgency}" from search term "${searchTerm}"`);
  }
  if (matchedCategory) {
    console.log(`Auto-detected category filter: "${matchedCategory}" from search term "${searchTerm}"`);
  }
  
  return {
    agency: matchedAgency || null,
    category: matchedCategory || null
  };
}

/**
 * Find grants that match the user's query using hybrid search (metadata filtering + RAG + keyword matching)
 * Returns: All grants matching category/agency filter PLUS any additional grants found by RAG
 */
async function findMatchingGrantsWithKB(query, userPreferences = {}) {
  try {
    // Auto-detect if query term matches an agency or category
    const tableName = process.env.NOFO_METADATA_TABLE_NAME;
    const enableDynamoDBCache = process.env.ENABLE_DYNAMODB_CACHE === 'true';
    
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
    
    // 1. Get filtered grants (if category/agency filter specified)
    let filteredResults = [];
    if (filters.category || filters.agency) {
      const metadataFilter = buildKBMetadataFilter(filters);
      filteredResults = await retrieveFromKnowledgeBase(query, metadataFilter);
      console.log(`[Filtered Search] Retrieved ${filteredResults.length} chunks from grants matching ${filters.category ? `category="${filters.category}"` : ''}${filters.category && filters.agency ? ' and ' : ''}${filters.agency ? `agency="${filters.agency}"` : ''}`);
    } else {
      console.log(`[Filtered Search] No filters applied - skipping filtered search`);
    }
    
    // 2. Get RAG results (unfiltered semantic search)
    const ragResults = await retrieveFromKnowledgeBase(query, null);
    console.log(`[RAG Search] Retrieved ${ragResults.length} chunks from semantic search (unfiltered)`);
    
    // 3. Combine and deduplicate results (union of filtered + RAG)
    // Filter out grants with blank/null metadata when filters are active
    const { combinedResults, stats } = await combineAndDeduplicateResults(
      filteredResults, 
      ragResults, 
      filters, 
      enableDynamoDBCache ? tableName : null
    );
    
    // Log detailed statistics
    console.log(`[Combined Results] Summary:`);
    console.log(`  - Grants from filtered search: ${stats.fromFiltered} unique grants`);
    console.log(`  - Grants from RAG search only: ${stats.fromRAGOnly} unique grants`);
    console.log(`  - Grants skipped (blank metadata): ${stats.skippedBlankMetadata}`);
    console.log(`  - Total unique grants: ${combinedResults.length}`);
    
    if (combinedResults.length === 0) {
      console.log('No results from Knowledge Base for query:', query);
      return [];
    }
    
    // 4. Extract grant information from the combined results
    const grantInfos = extractGrantInfoFromKBResults(combinedResults);
    console.log(`[Grant Extraction] Extracted ${grantInfos.length} unique grants from ${combinedResults.length} chunks`);
    
    // 5. Enhance results with keyword matching boost
    const enhancedGrants = enhanceWithKeywordMatching(grantInfos, filters.keywords);
    console.log(`[Keyword Enhancement] Enhanced ${enhancedGrants.length} grants with keyword matching`);
    
    // 6. Use Bedrock to analyze and score the grants against the user query
    const scoredGrants = await analyzeAndScoreGrants(query, enhancedGrants, userPreferences);
    console.log(`[LLM Scoring] Final scored grants: ${scoredGrants.length} grants (score >= 80)`);
    
    return scoredGrants;
  } catch (error) {
    console.error('Error finding matching grants with KB:', error);
    return [];
  }
}

/**
 * Combine filtered and RAG results, deduplicating by grant ID
 * Prioritizes filtered results when duplicates exist (keeps higher score)
 * Optionally filters out grants with blank/null metadata when filters are active
 */
async function combineAndDeduplicateResults(filteredResults, ragResults, activeFilters = {}, tableName = null) {
  const grantMap = new Map();
  const stats = {
    fromFiltered: 0,
    fromRAGOnly: 0,
    skippedBlankMetadata: 0,
    duplicates: 0
  };
  
  // Track unique grant IDs from filtered results
  const filteredGrantIds = new Set();
  
  // First, add filtered results (these are guaranteed matches)
  for (const result of filteredResults) {
    const grantId = extractGrantIdFromResult(result);
    if (grantId) {
      filteredGrantIds.add(grantId);
      // Keep the highest scoring chunk for each grant
      if (!grantMap.has(grantId) || result.score > grantMap.get(grantId).score) {
        grantMap.set(grantId, result);
      }
    }
  }
  
  stats.fromFiltered = filteredGrantIds.size;
  
  // Then, add RAG results (only if not already in map)
  // If filters are active, check if grant has blank/null metadata
  const hasActiveFilter = activeFilters.category || activeFilters.agency;
  
  for (const result of ragResults) {
    const grantId = extractGrantIdFromResult(result);
    if (!grantId) continue;
    
    // Skip if already in map (from filtered results)
    if (grantMap.has(grantId)) {
      stats.duplicates++;
      // Update if RAG result has higher score than filtered result
      if (result.score > grantMap.get(grantId).score) {
        grantMap.set(grantId, result);
      }
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
    
    // Add RAG result (not in filtered results)
    grantMap.set(grantId, result);
    stats.fromRAGOnly++;
  }
  
  return {
    combinedResults: Array.from(grantMap.values()),
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
          numberOfResults: 25 // Request more results to ensure we get good coverage
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
 */
async function analyzeAndScoreGrants(query, grantInfos, userPreferences) {
  // If no grants found in KB, return empty array
  if (grantInfos.length === 0) {
    return [];
  }
  
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
  const prompt = `
    # GRANT MATCHING SYSTEM

## TASK OVERVIEW
You are a specialized grant matching expert. Your task is to analyze available grants and identify the most relevant ones that match the user's specific needs and preferences.

## INPUT DATA
<user_query>${query}</user_query>
${userPreferences ? `<user_preferences>${JSON.stringify(userPreferences)}</user_preferences>` : ''}

## AVAILABLE GRANTS DATABASE
<grants>
${grantsWithCombinedContent.map((grant, index) => `
<grant id="${grant.grantId}" relevance_score="${grant.relevanceScore}" rag_score="${grant.ragScore || grant.score}" keyword_matches="${grant.keywordMatches || 0}">
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
4. Only include grants with a match score of 80 or higher in your final output
5. If the user's query is not related to grants at all, return an empty array

## OUTPUT INSTRUCTIONS
Return a JSON array of matching grants, where each grant is represented as an object with the following structure:
  {"grantId": "exact ID as provided in the grant listing",
    "matchScore": 85, // number between 0-100
    "matchReason": "Concise explanation of why this grant matches the user's needs",
    "eligibilityMatch": true, // boolean indicating if user likely meets eligibility
    "keyRequirements": [
      "Requirement 1",
      "Requirement 2",
      "Requirement 3"
    ]},
  // Additional matching grants...

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
      const matchingGrants = JSON.parse(jsonMatch[0]);
      
      // Post-process to ensure no "Grant N" names are used
      const processedGrants = matchingGrants.map(grant => {
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
        
        return grant;
      });
      
      // Sort by match score (highest first)
      return processedGrants.sort((a, b) => b.matchScore - a.matchScore);
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