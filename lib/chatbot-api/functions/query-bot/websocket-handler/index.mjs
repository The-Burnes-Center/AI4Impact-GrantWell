/**
 * This Lambda function handles WebSocket connections for the Query Bot.
 * It processes user queries about NOFOs with concise responses and 
 * can recommend similar grants.
 */

import { ApiGatewayManagementApiClient, PostToConnectionCommand, DeleteConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { BedrockAgentRuntimeClient, RetrieveCommand as KBRetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import ClaudeModel from "../../websocket-chat/models/claude3Sonnet.mjs";

// Environment variables and clients
const ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT;
const QUERY_PROMPT = `You are a concise query assistant that helps users understand grant requirements. 
Use these guidelines:
1. Keep responses very brief and to the point
2. Focus on answering the specific question asked
3. Provide direct, factual information from the documents
4. Avoid unnecessary explanations or verbosity
5. If asked about other grants, mention you can provide recommendations
6. Format information in an easy-to-read way using bullet points when appropriate`;

const wsConnectionClient = new ApiGatewayManagementApiClient({ endpoint: ENDPOINT });

/**
 * Retrieves documents from the Bedrock Knowledge Base based on a query.
 * 
 * @param {string} query - The query text.
 * @param {object} knowledgeBase - The Bedrock Knowledge Base client.
 * @param {string} knowledgeBaseID - The ID of the Knowledge Base.
 * @param {string} documentIdentifier - The document identifier for filtering.
 * @param {boolean} searchAllNofos - Whether to search across all NOFOs.
 * @returns {object} - An object containing the retrieved content and URIs.
 */
async function retrieveKBDocs(query, knowledgeBase, knowledgeBaseID, documentIdentifier, searchAllNofos = false) {
  const input = {
    knowledgeBaseId: knowledgeBaseID,
    retrievalQuery: { text: query },
  };

  try {
    const command = new KBRetrieveCommand(input);
    const response = await knowledgeBase.send(command);

    // If searching all NOFOs, don't filter by documentIdentifier
    let confidenceFilteredResults;
    if (searchAllNofos) {
      confidenceFilteredResults = response.retrievalResults.filter(item => item.score > 0.5);
    } else {
      const folderPath = documentIdentifier.endsWith("/") ? documentIdentifier : `${documentIdentifier}/`;
      confidenceFilteredResults = response.retrievalResults.filter(item => {
        try {
          return (
            item.score > 0.5 && 
            item.location?.s3Location?.uri &&
            item.location.s3Location.uri.includes(folderPath)
          );
        } catch (error) {
          console.warn("Skipping item due to missing properties:", item);
          return false;
        }
      });
    }

    let fullContent = confidenceFilteredResults.map(item => item.content.text).join('\n');
    const documentUris = confidenceFilteredResults.map(item => {
      return {
        title: item.location.s3Location.uri.slice(
          item.location.s3Location.uri.lastIndexOf("/") + 1
        ) + " (Bedrock Knowledge Base)",
        uri: item.location.s3Location.uri,
      };
    });

    const uniqueUris = Array.from(
      new Map(documentUris.map(item => [item.uri, item])).values()
    );

    if (fullContent === '') {
      fullContent = `No knowledge available! This query is likely outside the scope of your knowledge.
      Please provide a general answer but do not attempt to provide specific details.`;
      console.log("Warning: no relevant sources found");
    }

    return {
      content: fullContent,
      uris: uniqueUris
    };
  } catch (error) {
    console.error("Caught error: could not retrieve Knowledge Base documents:", error);
    return {
      content: `No knowledge available! There is something wrong with the search tool. Please tell the user to submit feedback.
      Please provide a general answer but do not attempt to provide specific details.`,
      uris: []
    };
  }
}

/**
 * Checks if the query is about recommendations or similar grants.
 * 
 * @param {string} query - The user's query text.
 * @returns {boolean} - Whether the query is about recommendations.
 */
function isRecommendationQuery(query) {
  const recommendationKeywords = [
    'similar', 'other grant', 'other grants', 'recommend', 'recommendation', 
    'alternative', 'alternatives', 'else', 'more grant', 'more grants', 
    'other option', 'other options', 'like this'
  ];
  
  const queryLower = query.toLowerCase();
  return recommendationKeywords.some(keyword => queryLower.includes(keyword));
}

/**
 * Gets grant recommendations by calling the recommendation Lambda.
 * 
 * @param {string} documentIdentifier - The current NOFO identifier.
 * @returns {object} - The recommendations response.
 */
async function getRecommendations(documentIdentifier) {
  const client = new LambdaClient({});
  
  const payload = {
    body: JSON.stringify({
      nofoId: documentIdentifier
    })
  };
  
  const command = new InvokeCommand({
    FunctionName: process.env.RECOMMENDATION_FUNCTION_NAME,
    Payload: JSON.stringify(payload)
  });
  
  const { Payload } = await client.send(command);
  const result = Buffer.from(Payload).toString();
  return JSON.parse(result);
}

/**
 * Get summarized information about a specific or all NOFOs.
 * 
 * @param {string} query - The query to determine what to retrieve.
 * @param {string} documentIdentifier - The current NOFO identifier.
 * @param {boolean} searchAllNofos - Whether to search across all NOFOs.
 * @returns {string} - A summarized overview of the NOFO(s).
 */
async function getNofoOverview(query, documentIdentifier, searchAllNofos) {
  const s3Client = new S3Client();
  
  try {
    if (searchAllNofos) {
      // This would be more efficiently done by the recommendation function
      // just calling it here for simplicity
      const recommendationsResponse = await getRecommendations(documentIdentifier);
      const recommendations = JSON.parse(recommendationsResponse.body).recommendations;
      
      return `Here are some available grants:\n` +
        recommendations.map(rec => `- ${rec.name} (${rec.id})`).join('\n');
    } else {
      // Get just the current NOFO summary
      const basePath = documentIdentifier.split('/')[0];
      const summaryKey = `${basePath}/summary.json`;
      
      const command = new GetObjectCommand({
        Bucket: process.env.BUCKET,
        Key: summaryKey,
      });
      
      const result = await s3Client.send(command);
      const fileContent = await streamToString(result.Body);
      const summary = JSON.parse(fileContent);
      
      return formatNofoSummary(summary);
    }
  } catch (error) {
    console.error("Error retrieving NOFO overview:", error);
    return "Unable to retrieve NOFO information at this time.";
  }
}

/**
 * Format a NOFO summary into a concise readable format.
 * 
 * @param {object} summary - The NOFO summary object.
 * @returns {string} - A formatted string representation.
 */
function formatNofoSummary(summary) {
  let result = `# ${summary.GrantName}\n\n`;
  
  if (summary.EligibilityCriteria && summary.EligibilityCriteria.length > 0) {
    result += "## Key Eligibility:\n";
    summary.EligibilityCriteria.slice(0, 3).forEach(criterion => {
      result += `- ${criterion.item}\n`;
    });
    result += "\n";
  }
  
  if (summary.KeyDeadlines && summary.KeyDeadlines.length > 0) {
    result += "## Important Deadlines:\n";
    summary.KeyDeadlines.slice(0, 3).forEach(deadline => {
      result += `- ${deadline.item}\n`;
    });
  }
  
  return result;
}

/**
 * Process user queries and generate concise responses.
 * 
 * @param {string} id - The connection ID.
 * @param {object} requestJSON - The request JSON.
 */
const processQuery = async (id, requestJSON) => {
  try {
    const data = requestJSON.data;
    const userQuery = data.userMessage;
    const userId = data.user_id;
    const sessionId = data.session_id;
    const documentIdentifier = data.documentIdentifier;
    const chatHistory = data.chatHistory || [];
    
    // Determine if we should search across all NOFOs
    const searchAllNofos = userQuery.toLowerCase().includes("all nofos") || 
                          userQuery.toLowerCase().includes("all grants") ||
                          userQuery.toLowerCase().includes("other grants");
    
    const knowledgeBase = new BedrockAgentRuntimeClient({ region: 'us-east-1' });
    if (!process.env.KB_ID) {
      throw new Error("Knowledge Base ID is not found.");
    }
    
    // Check if this is a recommendation query
    if (isRecommendationQuery(userQuery)) {
      const recommendationsResponse = await getRecommendations(documentIdentifier);
      const recommendations = JSON.parse(recommendationsResponse.body);
      
      const responseMessage = `Here are some similar grants you might be interested in:\n\n` +
        recommendations.recommendations.map((rec, index) => 
          `${index + 1}. **${rec.name}** (${rec.id})\n   - ${rec.matchingCriteria.join(', ')}`
        ).join('\n\n');
      
      // Send the recommendations directly
      const responseParams = {
        ConnectionId: id,
        Data: responseMessage
      };
      
      await wsConnectionClient.send(new PostToConnectionCommand(responseParams));
      
      // Send EOF marker
      const eofParams = {
        ConnectionId: id,
        Data: "!<|EOF_STREAM|>!"
      };
      await wsConnectionClient.send(new PostToConnectionCommand(eofParams));
      
      // Send empty metadata
      const metadataParams = {
        ConnectionId: id,
        Data: JSON.stringify([])
      };
      await wsConnectionClient.send(new PostToConnectionCommand(metadataParams));
      
      // Close the connection
      await wsConnectionClient.send(new DeleteConnectionCommand({ ConnectionId: id }));
      return;
    }
    
    // Check if the query is for a general overview of the NOFO(s)
    if (userQuery.toLowerCase().includes("overview") || 
        userQuery.toLowerCase().includes("summary") || 
        userQuery.toLowerCase().includes("tell me about")) {
      
      const overviewText = await getNofoOverview(userQuery, documentIdentifier, searchAllNofos);
      
      // Send the overview directly
      const responseParams = {
        ConnectionId: id,
        Data: overviewText
      };
      
      await wsConnectionClient.send(new PostToConnectionCommand(responseParams));
      
      // Send EOF marker and empty metadata
      await wsConnectionClient.send(
        new PostToConnectionCommand({
          ConnectionId: id,
          Data: "!<|EOF_STREAM|>!"
        })
      );
      
      await wsConnectionClient.send(
        new PostToConnectionCommand({
          ConnectionId: id,
          Data: JSON.stringify([])
        })
      );
      
      // Close the connection
      await wsConnectionClient.send(new DeleteConnectionCommand({ ConnectionId: id }));
      return;
    }
    
    // For regular queries, retrieve from KB and use Claude for concise answers
    const fullDocs = await retrieveKBDocs(
      userQuery, 
      knowledgeBase, 
      process.env.KB_ID, 
      documentIdentifier,
      searchAllNofos
    );
    
    let claude = new ClaudeModel();
    
    // Build a history format that Claude can use, keeping it minimal
    const lastMessage = chatHistory.length > 0 ? 
      chatHistory[chatHistory.length - 1] : 
      { user: "", chatbot: "" };
      
    let history = claude.assembleHistory([lastMessage], 
      `Answer this query concisely using only the provided context. 
      Current NOFO: ${documentIdentifier}
      User query: ${userQuery}
      
      Context from documents:
      ${fullDocs.content}`);
    
    // Update system prompt to enforce brevity
    const updatedSystemPrompt = QUERY_PROMPT;
    
    // Get streamed response from Claude
    const stream = await claude.getStreamedResponse(updatedSystemPrompt, history);
    let modelResponse = '';
    
    // Process the stream and send chunks to the client
    try {
      for await (const event of stream) {
        const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
        const parsedChunk = claude.parseChunk(chunk);
        
        if (parsedChunk && typeof parsedChunk === 'string') {
          modelResponse += parsedChunk;
          
          // Send chunks to the client
          const responseParams = {
            ConnectionId: id,
            Data: parsedChunk.toString()
          };
          
          try {
            await wsConnectionClient.send(new PostToConnectionCommand(responseParams));
          } catch (error) {
            console.error("Error sending chunk:", error);
          }
        }
      }
    } catch (error) {
      console.error("Stream processing error:", error);
      const errorParams = {
        ConnectionId: id,
        Data: `<!ERROR!>: ${error}`
      };
      await wsConnectionClient.send(new PostToConnectionCommand(errorParams));
    }
    
    // Send EOF marker
    await wsConnectionClient.send(
      new PostToConnectionCommand({
        ConnectionId: id,
        Data: "!<|EOF_STREAM|>!"
      })
    );
    
    // Send sources metadata
    const links = JSON.stringify(fullDocs.uris);
    await wsConnectionClient.send(
      new PostToConnectionCommand({
        ConnectionId: id,
        Data: links
      })
    );
    
    // Save the chat to session history
    try {
      const client = new LambdaClient({});
      const sessionRequest = {
        body: JSON.stringify({
          operation: "update_session",
          user_id: userId,
          session_id: sessionId,
          new_chat_entry: [{ 
            user: userQuery, 
            chatbot: modelResponse,
            metadata: fullDocs.uris
          }],
          document_identifier: documentIdentifier,
        })
      };
      
      await client.send(new InvokeCommand({
        FunctionName: process.env.SESSION_HANDLER,
        Payload: JSON.stringify(sessionRequest),
      }));
    } catch (error) {
      console.error("Error saving session:", error);
    }
    
    // Close the connection
    await wsConnectionClient.send(new DeleteConnectionCommand({ ConnectionId: id }));
    
  } catch (error) {
    console.error("Error:", error);
    const responseParams = {
      ConnectionId: id,
      Data: `<!ERROR!>: ${error}`
    };
    await wsConnectionClient.send(new PostToConnectionCommand(responseParams));
  }
};

/**
 * Converts a readable stream to a string.
 * 
 * @param {ReadableStream} stream - The stream to convert
 * @returns {string} - The stream content as a string
 */
async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

/**
 * Main Lambda handler function for WebSocket events.
 * Handles connect, disconnect, and processing queries.
 * 
 * @param {object} event - The event object containing request data.
 * @returns {object} - A response object with a status code and optional body.
 */
export const handler = async (event) => {
  if (event.requestContext) {
    const connectionId = event.requestContext.connectionId;
    const routeKey = event.requestContext.routeKey;
    let body = {};
    
    try {
      if (event.body) {
        body = JSON.parse(event.body);
      }
    } catch (err) {
      console.error("Failed to parse JSON:", err);
    }

    switch (routeKey) {
      case '$connect':
        return { statusCode: 200 };
      case '$disconnect':
        return { statusCode: 200 };
      case '$default':
        return { action: 'Default Response Triggered' };
      case "getQueryResponse":
        await processQuery(connectionId, body);
        return { statusCode: 200 };
      default:
        return {
          statusCode: 404,
          body: JSON.stringify({
            error: "The requested route is not recognized."
          })
        };
    }
  }
  
  return { statusCode: 200 };
};