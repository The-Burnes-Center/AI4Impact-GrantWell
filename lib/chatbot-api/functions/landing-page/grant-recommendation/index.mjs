/**
 * Grant Recommendation Lambda Function
 * 
 * This function analyzes user queries to find grants matching their criteria
 * by searching through summary.json files in the NOFO bucket.
 */

import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const s3Client = new S3Client({ region: 'us-east-1' });
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });

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
    
    // Get list of all NOFO folders
    const nofos = await listNOFOFolders();
    console.log(`Found ${nofos.length} NOFOs to search through`);
    
    // Load summary files for all NOFOs
    const summaries = await Promise.all(
      nofos.map(async (nofo) => {
        try {
          const summary = await getSummaryFile(nofo);
          return {
            name: nofo,
            summary: summary
          };
        } catch (error) {
          console.warn(`Error loading summary for ${nofo}:`, error);
          return null;
        }
      })
    );
    
    // Filter out NOFOs without valid summaries
    const validSummaries = summaries.filter(item => item !== null);
    
    // Analyze which grants match the user's query
    const matchingGrants = await findMatchingGrants(query, validSummaries, userPreferences);
    
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
 * Lists all NOFO folders in the S3 bucket
 */
async function listNOFOFolders() {
  const command = new ListObjectsV2Command({
    Bucket: process.env.BUCKET,
    Delimiter: '/'
  });
  
  const response = await s3Client.send(command);
  
  // Extract folder names (common prefixes)
  const folders = response.CommonPrefixes
    ? response.CommonPrefixes.map(prefix => prefix.Prefix.replace('/', ''))
    : [];
  
  return folders;
}

/**
 * Gets the summary.json file for a specific NOFO
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
    console.error(`Error retrieving summary for ${nofoFolder}:`, error);
    throw error;
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
 * Find grants that match the user's query and preferences
 */
async function findMatchingGrants(query, summaries, userPreferences = {}) {
  // Use Bedrock to analyze which grants match the query
  const prompt = `
    <analysis_request>
      You are a grant matching expert. I'll provide you with a user query about what kind of grant they're looking for 
      and details about several grants. I need you to analyze which grants best match the user's needs.
      
      User query: "${query}"
      
      ${userPreferences ? `User preferences: ${JSON.stringify(userPreferences)}` : ''}
      
      Available grants:
      ${summaries.map(item => `
        Grant name: ${item.name}
        Description: ${item.summary.GrantDescription || 'Not available'}
        Funding agency: ${item.summary.FundingAgency || 'Not available'}
        Grant amount: ${item.summary.TotalFunding || 'Not available'}
        Eligibility: ${item.summary.EligibleApplicants ? JSON.stringify(item.summary.EligibleApplicants) : 'Not available'}
        Deadline: ${item.summary.Deadline || 'Not available'}
      `).join('\n\n')}
      
      Return your analysis as a JSON array, with each item having these fields:
      - grantId: the grant name
      - matchScore: a number from 0-100 representing how well this matches the user's query
      - matchReason: a brief explanation of why this grant matches (or doesn't match) the query
      - eligibilityMatch: boolean indicating if the user is likely eligible based on the query
      - keyRequirements: array of strings listing key requirements for this grant
      
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
    console.error('Error calling Bedrock:', error);
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
        const summary = await getSummaryFile(grant.grantId);
        
        return {
          ...grant,
          name: summary.GrantName || grant.grantId,
          fundingAmount: summary.TotalFunding || 'Not specified',
          deadline: summary.Deadline || 'Not specified',
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