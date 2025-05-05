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

// Define model ID for Claude
const MODEL_ID = 'anthropic.claude-3-sonnet-20240229-v1:0';

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
        Grant ${index + 1}: ${grant.grantId}
        Relevance score from vector search: ${grant.score}
        Content from Knowledge Base:
        ${grant.combinedContent}
      `).join('\n\n')}
      
      Return your analysis as a JSON array, with each item having these fields:
      - grantId: the grant identifier
      - matchScore: a number from 0-100 representing how well this matches the user's query, considering relevance to projects like "building a bridge" if that was the query
      - matchReason: a brief explanation of why this grant matches (or doesn't match) the query
      - eligibilityMatch: boolean indicating if the user is likely eligible based on the query
      - keyRequirements: array of strings listing key requirements for this grant
      
      Only include grants that are genuinely relevant to the query. If a grant has a low match score (below 60), you can exclude it.
      Only return the JSON array, nothing else.
    </analysis_request>
  `;
  
  const bedrockParams = {
    modelId: MODEL_ID,
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
      
      // Sort by match score (highest first)
      return matchingGrants.sort((a, b) => b.matchScore - a.matchScore);
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
  // Generate appropriate response based on matching grants
  const topGrants = matchingGrants.slice(0, 3); // Get top 3 matching grants
  
  // Enhance grants with additional information from summaries
  const enhancedGrants = await Promise.all(
    topGrants.map(async (grant) => {
      try {
        // Try to get the summary file for additional details
        const summary = await getSummaryFile(grant.grantId);
        
        return {
          ...grant,
          name: summary?.GrantName || grant.grantId,
          fundingAmount: summary?.TotalFunding || 'Not specified',
          deadline: summary?.Deadline || 'Not specified',
          summaryUrl: `${grant.grantId}/`
        };
      } catch (error) {
        console.warn(`Error enhancing grant ${grant.grantId}:`, error);
        return {
          ...grant,
          name: grant.grantId,
          fundingAmount: 'Not specified',
          deadline: 'Not specified',
          summaryUrl: `${grant.grantId}/`
        };
      }
    })
  );
  
  // Generate suggested follow-up questions based on the grants
  const suggestedQuestions = await generateSuggestedQuestions(query, enhancedGrants);
  
  return {
    grants: enhancedGrants,
    suggestedQuestions: suggestedQuestions
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

/**
 * Generate suggested follow-up questions based on matching grants
 */
async function generateSuggestedQuestions(query, matchingGrants) {
  if (matchingGrants.length === 0) {
    return [
      "What specific type of project are you looking to fund?",
      "Are you applying as a government entity, nonprofit, or other organization?",
      "What amount of funding are you looking for?"
    ];
  }
  
  const prompt = `
    <question_generation>
      Based on the user's query and the matching grants, generate 3 helpful follow-up questions.
      
      User query: "${query}"
      
      Matching grants:
      ${matchingGrants.map(grant => `
        - ${grant.name}: Match score ${grant.matchScore}/100. ${grant.matchReason}
      `).join('\n')}
      
      Generate 3 concise, specific follow-up questions that would help clarify the user's needs or explain
      the requirements for these specific grants. Questions should be directly related to the grants found.
      
      Return only the questions as a JSON array of strings, nothing else.
    </question_generation>
  `;
  
  const bedrockParams = {
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1000,
      temperature: 0.2,
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
      return JSON.parse(jsonMatch[0]);
    } else {
      console.error('Failed to extract JSON from response:', content);
      return [
        `What specific requirements are needed for the ${matchingGrants[0]?.name || 'top matching grant'}?`,
        "Do you have any specific budget requirements for your project?",
        "When are you looking to apply for funding?"
      ];
    }
  } catch (error) {
    console.error('Error generating suggested questions:', error);
    return [
      "What specific type of project are you looking to fund?",
      "Are you applying as a government entity, nonprofit, or other organization?",
      "What amount of funding are you looking for?"
    ];
  }
}