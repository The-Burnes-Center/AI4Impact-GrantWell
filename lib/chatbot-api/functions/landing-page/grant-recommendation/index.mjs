/**
 * Grant Recommendation Lambda Function
 * 
 * This function analyzes user queries to find grants matching their criteria
 * by searching through the Bedrock Knowledge Base, providing more accurate results.
 */

import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { BedrockAgentRuntimeClient, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';

const s3Client = new S3Client({ region: 'us-east-1' });
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
const kbClient = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

// Define model IDs
const CLAUDE_MODEL_ID = 'anthropic.claude-4-sonnet-20240514-v1:0';
const MISTRAL_MODEL_ID = 'mistral.mistral-7b-instruct-v0:2';

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
    
    // Find matching grants using Knowledge Base
    const matchingGrants = await findMatchingGrantsWithKB(query, userPreferences);
    
    // Generate response with recommendations
    const response = await generateRecommendationResponse(query, matchingGrants);
    
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
 * Find grants that match the user's query using the Knowledge Base
 */
async function findMatchingGrantsWithKB(query, userPreferences = {}) {
  try {
    // 1. First, retrieve relevant documents from Knowledge Base
    const kbResults = await retrieveFromKnowledgeBase(query);
    if (!kbResults || kbResults.length === 0) {
      console.log('No results from Knowledge Base for query:', query);
      return [];
    }
    
    // 2. Extract grant information from the KB results
    const grantInfos = extractGrantInfoFromKBResults(kbResults);
    
    // 3. Use Bedrock to analyze and score the grants against the user query
    return await analyzeAndScoreGrants(query, grantInfos, userPreferences);
  } catch (error) {
    console.error('Error finding matching grants with KB:', error);
    return [];
  }
}

/**
 * Retrieve documents from the Bedrock Knowledge Base
 */
async function retrieveFromKnowledgeBase(query) {
  // Ensure KB_ID environment variable is set
  if (!process.env.KB_ID) {
    throw new Error('KB_ID environment variable is not set');
  }
  
  try {
    const input = {
      knowledgeBaseId: process.env.KB_ID,
      retrievalQuery: { text: query },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          numberOfResults: 10 // Request more results to ensure we get good coverage
        }
      }
    };
    
    const command = new RetrieveCommand(input);
    const response = await kbClient.send(command);
    
    // Filter results by confidence score
    const confidenceFilteredResults = response.retrievalResults.filter(item => 
      item.score > 0.5 // Only include results with reasonable confidence
    );
    
    console.log(`Retrieved ${confidenceFilteredResults.length} relevant documents from KB`);
    
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
          score: result.score
        });
      }
      
      // Add this content to the grant
      grantMap.get(folderName).content.push(result.content.text);
      
      // Keep the highest score we've seen for this grant
      if (result.score > grantMap.get(folderName).score) {
        grantMap.get(folderName).score = result.score;
      }
    } catch (error) {
      console.warn('Error processing KB result:', error);
    }
  }
  
  // Convert map to array
  return Array.from(grantMap.values());
}

/**
 * Analyze and score grants against the user query using Bedrock
 */
async function analyzeAndScoreGrants(query, grantInfos, userPreferences) {
  // If no grants found in KB, return empty array
  if (grantInfos.length === 0) {
    return [];
  }
  
  // First, check if the query is grant-related using the cheaper Mistral model
  const isGrantRelatedQuery = await checkIfQueryIsGrantRelated(query);
  if (!isGrantRelatedQuery) {
    return [{
      grantId: "NOT_GRANT_RELATED",
      matchScore: 0,
      matchReason: "The query does not appear to be related to grants or funding opportunities.",
      eligibilityMatch: false,
      keyRequirements: [],
      isNotGrantRelated: true
    }];
  }
  
  // Combine the content for each grant into a single string
  const grantsWithCombinedContent = grantInfos.map(grant => ({
    ...grant,
    combinedContent: grant.content.join('\n\n')
  }));
  
  // Create a prompt for Bedrock to analyze the grants
  const prompt = `
    <analysis_request>
      You are a grant matching expert. I'll provide you with a user query about what kind of grant they're looking for 
      and details about several grants extracted from a Knowledge Base. I need you to analyze which grants best match the user's needs.
      
      User query: "${query}"
      
      ${userPreferences ? `User preferences: ${JSON.stringify(userPreferences)}` : ''}
      
      Available grants:
      ${grantsWithCombinedContent.map((grant, index) => `
        Grant ID: ${grant.grantId}
        Relevance score from vector search: ${grant.score}
        Content from Knowledge Base:
        ${grant.combinedContent}
      `).join('\n\n')}
      
      Return your analysis as a JSON array, with each item having these fields:
      - grantId: the grant identifier
      - matchScore: a number from 0-100 representing how well this matches the user's query, considering relevance to projects like "building a bridge" if that was the query
      - matchReason: a brief explanation of why this grant matches (or doesn't match) the query
      - eligibilityMatch: boolean indicating if the user is likely eligible based on the query
      - keyRequirements: array of strings listing 3-5 key requirements for this grant
      
      Only include grants that are genuinely relevant to the query. If a grant has a low match score (below 75), exclude it.
      If the query is not related to grants, return an empty array.
      IMPORTANT: Make sure to use the exact grantId I provided, not labels like "Grant 1" or "Grant 2".
      Return only the JSON array, nothing else.
    </analysis_request>
  `;
  
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
 * Check if a query is related to grants or funding opportunities
 * Uses Mistral to analyze the query intent (more cost-effective for simple classification)
 */
async function checkIfQueryIsGrantRelated(query) {
  const prompt = `
    <task>
    Analyze if this query is related to grants, funding opportunities, financial assistance programs, or similar government/private funding mechanisms.
    
    Examples of grant-related queries:
    - "Looking for federal grants for renewable energy projects"
    - "What types of education funding are available for rural schools"
    - "How to apply for COVID relief programs for small businesses"
    - "Are there infrastructure grants available for my city"
    - "What grants exist for community development"
    - "What bridge construction funding is available"
    - "Looking for grants to fund my healthcare initiative"
    
    Examples of NON-grant-related queries:
    - "What's the weather like today"
    - "Tell me a joke"
    - "How to hack into a bank account"
    - "Who is the current president"
    - "Give me information about space"
    - "Write me a poem"
    - "What's your name"
    
    Query to analyze: "${query}"
    
    Answer with only "true" if grant-related or "false" if not grant-related.
    </task>
  `;
  
  const bedrockParams = {
    modelId: MISTRAL_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      prompt: prompt,
      max_tokens: 10,
      temperature: 0
    })
  };
  
  try {
    const command = new InvokeModelCommand(bedrockParams);
    const response = await bedrockClient.send(command);
    
    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body)
    );
    
    // Mistral returns different structure than Claude
    const content = responseBody.outputs[0].text.trim().toLowerCase();
    return content.includes('true');
  } catch (error) {
    console.error('Error checking if query is grant-related:', error);
    // Default to true in case of error to avoid blocking legitimate queries
    return true;
  }
}

/**
 * Generate a response for the recommendation with suggested questions
 */
async function generateRecommendationResponse(query, matchingGrants) {
  // Check if the query was determined to be not grant-related
  if (matchingGrants.length === 1 && matchingGrants[0].isNotGrantRelated) {
    return {
      grants: [],
      isNotGrantRelated: true,
      message: "I'm designed to help with grant and funding opportunities. Your query doesn't appear to be related to grants. Please try asking about specific funding programs, grants for particular projects, or financial assistance opportunities."
    };
  }
  
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
        status: summary?.status || 'active' // Track status for debugging
      });
    } catch (error) {
      console.warn(`Error processing grant ${grant.grantId}:`, error);
      // For errors, include the grant but mark it as active (default assumption)
      enhancedGrants.push({
        grantId: grant.grantId,
        name: grant.grantId,
        deadline: 'Not specified',
        keyRequirements: grant.keyRequirements || [],
        summaryUrl: `${grant.grantId}/`,
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
    const streamToString = await streamToString(response.Body);
    return JSON.parse(streamToString);
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