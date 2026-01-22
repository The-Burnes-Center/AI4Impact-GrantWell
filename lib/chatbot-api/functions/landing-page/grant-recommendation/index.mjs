/**
 * Grant Recommendation Lambda Function
 * 
 * This function analyzes user queries to find grants matching their criteria
 * by searching through the Bedrock Knowledge Base using RAG (Retrieval-Augmented Generation).
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { BedrockAgentRuntimeClient, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';

const s3Client = new S3Client({ region: 'us-east-1' });
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
const kbClient = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

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
 * Find grants that match the user's query using hybrid search (metadata filtering + RAG + keyword matching)
 * Returns: All grants matching category/agency filter PLUS any additional grants found by RAG
 */
async function findMatchingGrantsWithKB(query, userPreferences = {}) {
  try {
    // Extract filters and keywords from userPreferences and query
    const filters = {
      category: userPreferences.category,
      agency: userPreferences.agency,
      keywords: extractKeywords(query)
    };
    
    // 1. Get filtered grants (if category/agency filter specified)
    let filteredResults = [];
    if (filters.category || filters.agency) {
      const metadataFilter = buildKBMetadataFilter(filters);
      filteredResults = await retrieveFromKnowledgeBase(query, metadataFilter);
      console.log(`Retrieved ${filteredResults.length} grants matching category/agency filter`);
    }
    
    // 2. Get RAG results (unfiltered semantic search)
    const ragResults = await retrieveFromKnowledgeBase(query, null);
    console.log(`Retrieved ${ragResults.length} grants from RAG search`);
    
    // 3. Combine and deduplicate results (union of filtered + RAG)
    const combinedResults = combineAndDeduplicateResults(filteredResults, ragResults);
    console.log(`Combined to ${combinedResults.length} unique grants`);
    
    if (combinedResults.length === 0) {
      console.log('No results from Knowledge Base for query:', query);
      return [];
    }
    
    // 4. Extract grant information from the combined results
    const grantInfos = extractGrantInfoFromKBResults(combinedResults);
    
    // 5. Enhance results with keyword matching boost
    const enhancedGrants = enhanceWithKeywordMatching(grantInfos, filters.keywords);
    
    // 6. Use Bedrock to analyze and score the grants against the user query
    return await analyzeAndScoreGrants(query, enhancedGrants, userPreferences);
  } catch (error) {
    console.error('Error finding matching grants with KB:', error);
    return [];
  }
}

/**
 * Combine filtered and RAG results, deduplicating by grant ID
 * Prioritizes filtered results when duplicates exist (keeps higher score)
 */
function combineAndDeduplicateResults(filteredResults, ragResults) {
  const grantMap = new Map();
  
  // First, add filtered results (these are guaranteed matches)
  for (const result of filteredResults) {
    const grantId = extractGrantIdFromResult(result);
    if (grantId) {
      // Keep the highest scoring chunk for each grant
      if (!grantMap.has(grantId) || result.score > grantMap.get(grantId).score) {
        grantMap.set(grantId, result);
      }
    }
  }
  
  // Then, add RAG results (only if not already in map)
  for (const result of ragResults) {
    const grantId = extractGrantIdFromResult(result);
    if (grantId && !grantMap.has(grantId)) {
      grantMap.set(grantId, result);
    } else if (grantId && result.score > grantMap.get(grantId).score) {
      // Update if RAG result has higher score than filtered result
      grantMap.set(grantId, result);
    }
  }
  
  return Array.from(grantMap.values());
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