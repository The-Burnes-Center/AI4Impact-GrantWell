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
const CLAUDE_MODEL_ID = 'us.anthropic.claude-sonnet-4-20250514-v1:0';

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
      body: JSON.stringify({ sections })
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
    # Grant Application Draft Generator

You are a professional grant writing expert tasked with creating a structured draft for a grant application based on the information provided below.

## Input Information

<user_query>
${{query}}
</user_query>

<project_basics>
${JSON.stringify(projectBasics, null, 2)}
</project_basics>

<questionnaire_responses>
${JSON.stringify(questionnaire, null, 2)}
</questionnaire_responses>

<grant_information>
${grantInfos.map((grant, index) => `
### Grant ID: ${grant.grantId}
${grant.combinedContent}
`).join('\n\n')}
</grant_information>

<nofo_sections>
${summary.ProjectNarrativeSections.map((section, index) => `
### ${index + 1}. ${section.item}
${section.description}
`).join('\n')}
</nofo_sections>

## Task Instructions

Your task is to generate a comprehensive grant application draft that follows the required sections specified in the Notice of Funding Opportunity (NOFO).

For each section in the NOFO:
1. Analyze the project basics and questionnaire responses to extract relevant information
2. Incorporate specific requirements and guidelines from the grant information
3. Ensure alignment with the grant's focus areas and priorities
4. Create content that is specific, actionable, and tailored to the applicant's project
5. Follow the section descriptions provided in the NOFO precisely
6. Use evidence-based language and appropriate technical terminology for grant applications

## Output Requirements

Generate your response as a JSON object with:
- Each key being the exact section name from the NOFO
- Each value containing well-structured, detailed content for that section

Example format:

{
  "${summary.ProjectNarrativeSections[0].item}": "Content for first section...",
  "${summary.ProjectNarrativeSections[1].item}": "Content for second section...",
  ...
}

CRITICAL: Your response must be ONLY a valid, complete JSON object. Do not include any explanations, commentary, or markdown formatting. Start with { and end with }. Ensure all strings are properly escaped and the JSON is syntactically correct.
  `;
  
  const bedrockParams = {
    modelId: CLAUDE_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1500,
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
    
    
    if (!responseBody.content || !responseBody.content[0] || !responseBody.content[0].text) {
      console.error('Invalid Bedrock response structure:', responseBody);
      throw new Error('Invalid response structure from Bedrock');
    }
    
    const content = responseBody.content[0].text;
    
    // Extract JSON from the response with improved parsing
    
    try {
      // First, try to find JSON wrapped in code blocks
      const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        return JSON.parse(codeBlockMatch[1]);
      }
      
      // If no code block, try to find the JSON object
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonString = jsonMatch[0];
        
        // Validate that we have a complete JSON object
        let braceCount = 0;
        let inString = false;
        let escaped = false;
        
        for (let i = 0; i < jsonString.length; i++) {
          const char = jsonString[i];
          
          if (escaped) {
            escaped = false;
            continue;
          }
          
          if (char === '\\') {
            escaped = true;
            continue;
          }
          
          if (char === '"' && !escaped) {
            inString = !inString;
            continue;
          }
          
          if (!inString) {
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                // We found a complete JSON object
                const completeJson = jsonString.substring(0, i + 1);
                return JSON.parse(completeJson);
              }
            }
          }
        }
        
        // If we get here, the JSON is incomplete
        console.error('Incomplete JSON detected - brace count:', braceCount);
        console.error('Partial JSON content:', jsonString.substring(0, 200) + '...');
        return {};
      }
      
      // Try parsing the entire content as JSON (in case it's clean JSON)
      return JSON.parse(content);
      
    } catch (parseError) {
      console.error('Failed to parse JSON from response:', parseError.message);
      console.error('Content that failed to parse:', content.substring(0, 500) + '...');
      
      // Fallback: Create a basic structure with the raw content
      const fallbackSections = {};
      if (summary && summary.ProjectNarrativeSections) {
        summary.ProjectNarrativeSections.forEach((section, index) => {
          fallbackSections[section.item] = `[Draft content needs review] - Raw response: ${content.substring(0, 200)}...`;
        });
      }
      
      return fallbackSections;
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
      Key: `${documentIdentifier}summary.json`
    });
    
    const response = await s3Client.send(command);
    const content = await response.Body.transformToString();
    return JSON.parse(content);
  } catch (error) {
    console.error('Error getting summary file:', error);
    return null;
  }
}