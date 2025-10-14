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
const CLAUDE_MODEL_ID = 'us.anthropic.claude-sonnet-4-20250514-v1:0';
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
    <grant_matching_task>
    You are a specialized grant matching expert tasked with identifying the most relevant grants for a user's specific needs.

    <input>
    - User query: "${query}"
    ${userPreferences ? `- User preferences: ${JSON.stringify(userPreferences)}}` : ''}
    </input>

    <available_grants>
    ${grantsWithCombinedContent.map((grant, index) => `
    [GRANT ${index+1}]
    Grant ID: ${grant.grantId}
    Relevance score from vector search: ${grant.score}
    Content from Knowledge Base:
    ${grant.combinedContent}
    [/GRANT ${index+1}]
    `).join('\n')}
    </available_grants>

    <instructions>
    1. Carefully analyze each grant against the user's query and preferences
    2. Evaluate grants based on:
      - Relevance to the user's specific project or need
      - Eligibility criteria match
      - Requirements alignment
    3. Only include grants with a match score of 75 or higher
    4. If the user query is not related to grants, return an empty array
    </instructions>

    <output_format>
    Return a JSON array where each object contains:
    {"grantId": "exact ID as provided in the grant listing",
      "matchScore": number between 0-100 representing relevance,
      "matchReason": "concise explanation of why this grant matches or doesn't match",
      "eligibilityMatch": boolean indicating if user likely meets eligibility requirements,
      "keyRequirements": ["3-5 key requirements", "for this grant", "as bullet points"]}
    </output_format>

    Return only the JSON array with no preamble or additional text.
    </grant_matching_task>`;
  
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
  Determine if the following query is related to grants, funding opportunities, financial assistance programs, or government/private funding mechanisms.

  <instructions>
  1. Analyze the query: "${query}"
  2. Classify it as either grant-related or not grant-related
  3. Respond with ONLY "true" if grant-related or "false" if not grant-related
  </instructions>

  <reference>
  Grant-related queries typically involve:
  - Government or private funding opportunities
  - Financial assistance programs
  - Monetary support for projects, initiatives, or organizations
  - Application processes for financial aid
  - Specific funding mechanisms for sectors (education, healthcare, infrastructure, etc.)

  Examples of GRANT-RELATED queries:
  - "Looking for federal grants for renewable energy projects"
  - "What types of education funding are available for rural schools"
  - "How to apply for COVID relief programs for small businesses"
  - "Are there infrastructure grants available for my city"
  - "What grants exist for community development"
  - "What bridge construction funding is available"
  - "Looking for grants to fund my healthcare initiative"

  Examples of NON-GRANT-RELATED queries:
  - "What's the weather like today"
  - "Tell me a joke"
  - "How to hack into a bank account"
  - "Who is the current president"
  - "Give me information about space"
  - "Write me a poem"
  - "What's your name"
  </reference>

  Your response must be ONLY "true" or "false" with no additional text, explanation, or formatting.
  </task>`;
  
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