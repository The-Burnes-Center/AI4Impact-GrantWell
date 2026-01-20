/**
 * Grant Recommendation Lambda Function
 * 
 * This function analyzes user queries to find grants matching their criteria
 * by searching through the Bedrock Knowledge Base, providing more accurate results.
 * Now includes tool calling to route simple keyword searches to direct filtering.
 */

import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { BedrockAgentRuntimeClient, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const s3Client = new S3Client({ region: 'us-east-1' });
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
const kbClient = new BedrockAgentRuntimeClient({ region: 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

// Define model IDs
const CLAUDE_MODEL_ID = 'us.anthropic.claude-sonnet-4-20250514-v1:0';

/**
 * Valid grant categories for filtering
 */
const VALID_CATEGORIES = [
  'Recovery Act', 'Agriculture', 'Arts', 'Business and Commerce', 'Community Development',
  'Consumer Protection', 'Disaster Prevention and Relief', 'Education', 'Employment, Labor, and Training',
  'Energy', 'Energy Infrastructure and Critical Mineral and Materials (EICMM)', 'Environment',
  'Food and Nutrition', 'Health', 'Housing', 'Humanities', 'Information and Statistics',
  'Infrastructure Investment and Jobs Act', 'Income Security and Social Services',
  'Law, Justice, and Legal Services', 'Natural Resources', 'Opportunity Zone Benefits',
  'Regional Development', 'Science, Technology, and Other Research and Development',
  'Transportation', 'Affordable Care Act', 'Other'
];

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
    
    // Determine if query should use keyword filtering or RAG
    const queryAnalysis = await determineQueryType(query);
    let matchingGrants = [];
    let searchMethod = 'rag';
    
    if (queryAnalysis.type === 'keyword_filter') {
      console.log(`Using keyword filter for query: ${query} - keyword: ${queryAnalysis.keyword}, category: ${queryAnalysis.category}, agency: ${queryAnalysis.agency}`);
      matchingGrants = await filterGrantsByKeyword(queryAnalysis.keyword, queryAnalysis.category, queryAnalysis.agency);
      searchMethod = 'keyword_filter';
    } else {
      console.log('Using RAG for query:', query);
      matchingGrants = await findMatchingGrantsWithKB(query, userPreferences);
    }
    
    // Generate response with recommendations
    const response = await generateRecommendationResponse(query, matchingGrants, searchMethod === 'keyword_filter');
    
    // Add search method/tool used to response for monitoring
    response.searchMethod = searchMethod;
    response.toolUsed = searchMethod === 'keyword_filter' ? 'filter_grants_by_keyword' : 'search_grants_with_rag';
    
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
 * Determine if query should use keyword filtering or RAG using tool calling
 */
async function determineQueryType(query) {
  const tools = [
    {
      name: 'filter_grants_by_keyword',
      description: 'Use this tool when the user query is a simple keyword, organization name, category name, agency name, or short phrase (1-3 words) that can be matched directly against grant names, categories, or agencies. Examples: "transportation", "MassDot", "education", "healthcare", "Department of Education", "Health", "NSF".',
      input_schema: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: 'The keyword or phrase to filter grants by (matched against grant names)'
          },
          category: {
            type: 'string',
            description: 'Optional: Filter by grant category',
            enum: VALID_CATEGORIES
          },
          agency: {
            type: 'string',
            description: 'Optional: Filter by agency name (e.g., "Department of Education", "National Science Foundation")'
          }
        },
        required: ['keyword']
      }
    },
    {
      name: 'search_grants_with_rag',
      description: 'Use this tool when the user query is a complex question, project description, or requires semantic understanding. Examples: "I need funding for a community mental health program", "What grants are available for rural broadband infrastructure?", "Find grants for small businesses affected by natural disasters".',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The complex query that requires semantic search'
          }
        },
        required: ['query']
      }
    }
  ];

  const prompt = `Analyze the user query and determine which search method to use.

User query: "${query}"

If the query is:
- A simple keyword (1-3 words) like "transportation", "MassDot", "education", "healthcare"
- An organization/agency name like "NSF", "Department of Education", "NIH"
- A category name like "Health", "Transportation", "Environment"
- A topic that can be matched directly against grant names

Then use filter_grants_by_keyword.

If the query is:
- A sentence or question describing a project need
- A complex requirement that needs semantic understanding
- A description of what the user is trying to accomplish

Then use search_grants_with_rag.

Choose the appropriate tool.`;

  try {
    const bedrockParams = {
      modelId: CLAUDE_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 500,
        temperature: 0,
        tools: tools,
        tool_choice: { type: 'auto' },
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    };

    const command = new InvokeModelCommand(bedrockParams);
    const response = await bedrockClient.send(command);
    
    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body)
    );
    
    // Check if tool was used
    for (const content of responseBody.content) {
      if (content.type === 'tool_use' && content.name === 'filter_grants_by_keyword') {
        return {
          type: 'keyword_filter',
          keyword: content.input.keyword || query,
          category: content.input.category || null,
          agency: content.input.agency || null
        };
      }
    }
    
    // Default to RAG for complex queries
    return { type: 'rag' };
  } catch (error) {
    console.error('Error determining query type, defaulting to RAG:', error);
    return { type: 'rag' };
  }
}

/**
 * Filter grants by keyword, category, or agency using DynamoDB
 */
async function filterGrantsByKeyword(keyword, category = null, agency = null) {
  const keywordLower = (keyword || '').toLowerCase().trim();
  const matches = [];
  
  try {
    const tableName = process.env.NOFO_METADATA_TABLE_NAME;
    
    if (!tableName) {
      console.warn('NOFO_METADATA_TABLE_NAME not set, using RAG fallback');
      return [];
    }
    
    let queryParams;
    
    // If filtering by category, use CategoryIndex
    if (category && VALID_CATEGORIES.includes(category)) {
      queryParams = {
        TableName: tableName,
        IndexName: 'CategoryIndex',
        KeyConditionExpression: 'category = :category',
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: marshall({
          ':category': category,
          ':status': 'active',
        }),
      };
    } else {
      // Default to StatusIndex for active grants
      queryParams = {
        TableName: tableName,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: marshall({
          ':status': 'active',
        }),
      };
    }

    const queryCommand = new QueryCommand(queryParams);
    const result = await dynamoClient.send(queryCommand);
    const activeGrants = (result.Items || []).map(item => unmarshall(item));
    
    console.log(`Retrieved ${activeGrants.length} grants from DynamoDB`);
    
    // Filter in-memory by keyword and/or agency
    for (const grant of activeGrants) {
      const grantName = (grant.nofo_name || '').toLowerCase();
      const grantAgency = (grant.agency || '').toLowerCase();
      
      let matchesKeyword = true;
      let matchesAgency = true;
      
      // Check keyword match (in grant name)
      if (keywordLower) {
        matchesKeyword = grantName.includes(keywordLower);
      }
      
      // Check agency match
      if (agency) {
        const agencyLower = agency.toLowerCase();
        matchesAgency = grantAgency.includes(agencyLower) || agencyLower.includes(grantAgency);
      }
      
      if (matchesKeyword && matchesAgency) {
        matches.push({
          grantId: grant.nofo_name,
          name: grant.nofo_name,
          deadline: grant.expiration_date || 'Not specified',
          keyRequirements: [],
          summaryUrl: `${grant.nofo_name}/`,
          matchScore: 100,
          matchReason: `Grant matches search criteria${category ? ` (Category: ${category})` : ''}${agency ? ` (Agency: ${agency})` : ''}`,
          eligibilityMatch: true,
          agency: grant.agency,
          category: grant.category
        });
      }
    }
    
    console.log(`Found ${matches.length} grants matching filters - keyword: ${keyword}, category: ${category}, agency: ${agency}`);
    
    // Sort alphabetically by name
    matches.sort((a, b) => a.name.localeCompare(b.name));
    
    // Limit to top 50 results
    return matches.slice(0, 50);
    
  } catch (error) {
    console.error('Error filtering grants from DynamoDB:', error);
    return [];
  }
}

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
  
  // Combine the content for each grant into a single string, truncating to reduce token usage
  const MAX_CONTENT_LENGTH = 3000; // Limit each grant's content to ~3000 characters
  const grantsWithCombinedContent = grantInfos.map(grant => {
    const combinedContent = grant.content.join('\n\n');
    const truncatedContent = combinedContent.length > MAX_CONTENT_LENGTH
      ? combinedContent.substring(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated for length...]'
      : combinedContent;
    return {
      ...grant,
      combinedContent: truncatedContent
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
<grant id="${grant.grantId}" relevance_score="${grant.score}">
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
async function generateRecommendationResponse(query, matchingGrants, isKeywordFilter = false) {
  // Enhance and filter grants - only include active NOFOs
  const enhancedGrants = [];
  let filteredOutCount = 0;
  
  // Process each matching grant - check status and enhance with summary data
  for (const grant of matchingGrants) {
    try {
      // For keyword filter results, grant already has name and is pre-filtered as active
      if (isKeywordFilter && grant.name) {
        // Still fetch summary for additional details like GrantName
        const summary = await getSummaryFile(grant.grantId);
        enhancedGrants.push({
          grantId: grant.grantId,
          name: summary?.GrantName || grant.name,
          deadline: grant.deadline || summary?.Deadline || 'Not specified',
          keyRequirements: grant.keyRequirements || [],
          summaryUrl: grant.summaryUrl,
          status: 'active',
          agency: grant.agency,
          category: grant.category
        });
        continue;
      }
      
      // For RAG results, get the summary file for additional details and status check
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