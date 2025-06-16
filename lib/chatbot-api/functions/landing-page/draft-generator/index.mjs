/**
 * Draft Generator Lambda Function
 * 
 * This function generates a draft for a given query.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { BedrockAgentRuntimeClient, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';

const s3Client = new S3Client({ region: 'us-east-1' });
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
const kbClient = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

// Define model IDs
const CLAUDE_MODEL_ID = 'anthropic.claude-3-sonnet-20240229-v1:0';

/**
 * Main handler function for draft generation
 */
export const handler = async (event) => {
  try {
    console.log('Event received:', JSON.stringify(event));
    
    // Parse the incoming request
    let body = {};
    if (event.body) {
      body = JSON.parse(event.body);
    }
    
    const { 
      query, 
      projectBasics,
      questionnaire,
      documentIdentifier,
      sessionId 
    } = body;
    
    if (!query || !documentIdentifier || !sessionId) {
      console.log('Missing required fields:', { query, documentIdentifier, sessionId });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Query, document identifier, and session ID are required' })
      };
    }
    
    console.log('Generating sections with:', { query, projectBasics, questionnaire, documentIdentifier, sessionId });
    // Generate sections based on project basics, questionnaire and KB content
    const sections = await generateSections(
      query,
      projectBasics,
      questionnaire,
      documentIdentifier,
      sessionId
    );
    console.log('Generated sections:', JSON.stringify(sections, null, 2));
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        sections,
        projectBasics,
        questionnaire,
        documentIdentifier,
        sessionId
      })
    };
  } catch (error) {
    console.error('Error processing draft generation:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process draft generation' })
    };
  }
};

/**
 * Generate sections based on project basics, questionnaire and KB content
 */
async function generateSections(query, projectBasics, questionnaire, documentIdentifier, sessionId) {
  try {
    // 1. First, retrieve relevant documents from Knowledge Base
    const kbResults = await retrieveFromKnowledgeBase(query, documentIdentifier);
    console.log('KB Results:', JSON.stringify(kbResults, null, 2));
    if (!kbResults || kbResults.length === 0) {
      console.log('No results from Knowledge Base for query:', query);
      return {};
    }
    
    // 2. Extract grant information from the KB results
    const grantInfos = extractGrantInfoFromKBResults(kbResults);
    console.log('Extracted grantInfos:', JSON.stringify(grantInfos, null, 2));
    
    // 3. Use Bedrock to analyze and generate sections
    const sections = await analyzeAndGenerateSections(
      query,
      grantInfos,
      projectBasics,
      questionnaire,
      documentIdentifier,
      sessionId
    );
    console.log('Sections from Bedrock:', JSON.stringify(sections, null, 2));
    
    return sections;
  } catch (error) {
    console.error('Error generating sections:', error);
    return {};
  }
}

/**
 * Retrieve relevant documents from Knowledge Base
 */
async function retrieveFromKnowledgeBase(query, documentIdentifier) {
  try {
    const params = {
      knowledgeBaseId: process.env.KB_ID,
      retrievalQuery: {
        text: query
      },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          numberOfResults: 5
        }
      }
    };

    const command = new RetrieveCommand(params);
    const response = await kbClient.send(command);
    
    return response.retrievalResults || [];
  } catch (error) {
    console.error('Error retrieving from Knowledge Base:', error);
    return [];
  }
}

/**
 * Analyze and generate sections using Bedrock
 */
async function analyzeAndGenerateSections(query, grantInfos, projectBasics, questionnaire, documentIdentifier, sessionId) {
  // Get NOFO summary to get the sections
  const summary = await getSummaryFile(documentIdentifier);
  if (!summary || !summary.ProjectNarrativeSections) {
    throw new Error('Failed to get NOFO sections from summary');
  }

  // Create a prompt for Bedrock to analyze and generate sections
  const prompt = `
    <analysis_request>
      You are a grant writing expert. I'll provide you with:
      1. A user query about their grant application
      2. Project basics information
      3. Questionnaire responses
      4. Relevant grant information from a Knowledge Base
      5. Required sections from the NOFO
      
      User query: "${query}"
      
      Project Basics:
      ${JSON.stringify(projectBasics, null, 2)}
      
      Questionnaire Responses:
      ${JSON.stringify(questionnaire, null, 2)}
      
      Grant Information:
      ${grantInfos.map((grant, index) => `
        Grant ID: ${grant.grantId}
        Content from Knowledge Base:
        ${grant.combinedContent}
      `).join('\n\n')}
      
      Required Sections from NOFO:
      ${summary.ProjectNarrativeSections.map((section, index) => `
        ${index + 1}. ${section.item}
        Description: ${section.description}
      `).join('\n')}
      
      Based on this information, generate a structured draft with the sections specified in the NOFO.
      For each section:
      - Use the project basics and questionnaire responses to personalize the content
      - Incorporate relevant requirements and guidelines from the grant information
      - Ensure the content aligns with the grant's focus areas
      - Make the content specific and actionable
      - Follow the section descriptions provided in the NOFO
      
      Return your response as a JSON object with each section as a key and its content as the value.
      Use the exact section names from the NOFO as the keys.
      Example format:
      {
        "${summary.ProjectNarrativeSections[0].item}": "Content for first section...",
        "${summary.ProjectNarrativeSections[1].item}": "Content for second section...",
        ...
      }
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
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      console.error('Failed to extract JSON from response:', content);
      return {};
    }
  } catch (error) {
    console.error('Error generating sections with Bedrock:', error);
    return {};
  }
}

/**
 * Extract grant information from KB results
 */
function extractGrantInfoFromKBResults(results) {
  return results.map(result => ({
    grantId: result.metadata?.grantId || 'unknown',
    combinedContent: result.content
  }));
}

/**
 * Get NOFO summary file from S3
 */
async function getSummaryFile(documentIdentifier) {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.BUCKET,
      Key: `${documentIdentifier}/summary.json`
    });
    
    const response = await s3Client.send(command);
    const content = await response.Body.transformToString();
    return JSON.parse(content);
  } catch (error) {
    console.error('Error getting summary file:', error);
    return null;
  }
}