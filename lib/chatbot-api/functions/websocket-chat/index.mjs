/**
 * This Lambda function handles WebSocket connections for the chatbot application.
 * It processes user messages, retrieves relevant documents from the Bedrock Knowledge Base, and generates responses using AI models.
 * The function supports connecting, disconnecting, and handling default and custom routes.
 */

import { ApiGatewayManagementApiClient, PostToConnectionCommand, DeleteConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { BedrockAgentRuntimeClient, RetrieveCommand as KBRetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import ClaudeModel from "./models/claude3Sonnet.mjs";
import Mistral7BModel from "./models/mistral7b.mjs";
import { PROMPT_TEXT } from "./prompt.mjs";

const ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT;
const SYS_PROMPT = PROMPT_TEXT;
const wsConnectionClient = new ApiGatewayManagementApiClient({ endpoint: ENDPOINT });
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

/**
 * Retrieves documents from the Bedrock Knowledge Base based on a query.
 * Filters results by confidence and S3 location.
 * 
 * @param {string} query - The query text.
 * @param {object} knowledgeBase - The Bedrock Knowledge Base client.
 * @param {string} knowledgeBaseID - The ID of the Knowledge Base.
 * @param {string} documentIdentifier - The document identifier for filtering.
 * @returns {object} - An object containing the retrieved content and URIs.
 */
/**
 * Runs a single KB query with a metadata filter and confidence threshold.
 * Returns { results, uris } arrays.
 */
async function runKBQuery(query, knowledgeBase, knowledgeBaseID, filter, numberOfResults, uriValidator) {
  const input = {
    knowledgeBaseId: knowledgeBaseID,
    retrievalQuery: { text: query, filter },
    retrievalConfiguration: {
      vectorSearchConfiguration: { numberOfResults }
    }
  };

  const command = new KBRetrieveCommand(input);
  const response = await knowledgeBase.send(command);

  const filtered = (response.retrievalResults || []).filter(item => {
    try {
      const uri = item.location?.s3Location?.uri;
      if (!uri || item.score <= 0.5) return false;
      return uriValidator ? uriValidator(uri) : true;
    } catch {
      return false;
    }
  });

  return {
    results: filtered,
    content: filtered.map(item => item.content.text).join('\n'),
    uris: filtered.map(item => ({
      title: item.location.s3Location.uri.slice(
        item.location.s3Location.uri.lastIndexOf("/") + 1
      ),
      uri: item.location.s3Location.uri,
    })),
  };
}

async function retrieveKBDocs(query, knowledgeBase, knowledgeBaseID, documentIdentifier, userId) {
  const folderPath = documentIdentifier.endsWith("/") ? documentIdentifier : `${documentIdentifier}/`;
  const nofoName = documentIdentifier.split("/").pop() || documentIdentifier;
  const userDocFolderPath = userId ? `${userId}/${nofoName}/` : null;

  const nofoFilter = {
    and: [
      { equals: { key: "metadataAttributes.documentType", value: "NOFO" } },
      { equals: { key: "metadataAttributes.documentIdentifier", value: documentIdentifier } }
    ]
  };

  const userDocFilter = userId ? {
    and: [
      { equals: { key: "metadataAttributes.documentType", value: "userDocument" } },
      { equals: { key: "metadataAttributes.userId", value: userId } },
      { equals: { key: "metadataAttributes.nofoName", value: nofoName } }
    ]
  } : null;

  try {
    // Split retrieval: separate queries for NOFO and user docs to ensure balanced context
    if (userDocFilter) {
      const [nofoResult, userResult] = await Promise.all([
        runKBQuery(query, knowledgeBase, knowledgeBaseID, nofoFilter, 7, uri => uri.includes(folderPath)),
        runKBQuery(query, knowledgeBase, knowledgeBaseID, userDocFilter, 5, uri => uri.includes(userDocFolderPath)),
      ]);

      console.log(`Split retrieval - NOFO: ${nofoResult.results.length} results, UserDocs: ${userResult.results.length} results`);

      const fullContent = [nofoResult.content, userResult.content].filter(Boolean).join('\n');
      const allUris = [...nofoResult.uris, ...userResult.uris];
      const uniqueUris = Array.from(new Map(allUris.map(item => [item.uri, item])).values());

      if (!fullContent) {
        return {
          content: `No knowledge available! This query is likely outside the scope of your knowledge.
          Please provide a general answer but do not attempt to provide specific details.`,
          uris: []
        };
      }

      return { content: fullContent, uris: uniqueUris };
    }

    // No user docs -- single NOFO-only query
    const nofoResult = await runKBQuery(query, knowledgeBase, knowledgeBaseID, nofoFilter, 10, uri => uri.includes(folderPath));

    console.log(`Single retrieval - NOFO: ${nofoResult.results.length} results`);

    if (!nofoResult.content) {
      return {
        content: `No knowledge available! This query is likely outside the scope of your knowledge.
        Please provide a general answer but do not attempt to provide specific details.`,
        uris: []
      };
    }

    const uniqueUris = Array.from(new Map(nofoResult.uris.map(item => [item.uri, item])).values());
    return { content: nofoResult.content, uris: uniqueUris };

  } catch (error) {
    console.error("Caught error: could not retrieve Knowledge Base documents:", error);

    // Fallback without metadata filter for backward compatibility
    if (error.name === 'ValidationException' || error.message?.includes('filter')) {
      console.warn("Metadata filter failed, attempting fallback query without filter");
      try {
        const fallbackCommand = new KBRetrieveCommand({
          knowledgeBaseId: knowledgeBaseID,
          retrievalQuery: { text: query },
        });
        const fallbackResponse = await knowledgeBase.send(fallbackCommand);

        const fallbackResults = (fallbackResponse.retrievalResults || []).filter(item => {
          try {
            const uri = item.location?.s3Location?.uri;
            if (!uri || item.score <= 0.5) return false;
            return uri.includes(folderPath) || (userDocFolderPath && uri.includes(userDocFolderPath));
          } catch {
            return false;
          }
        });

        const fallbackContent = fallbackResults.map(item => item.content.text).join('\n');
        const fallbackUris = fallbackResults.map(item => ({
          title: item.location.s3Location.uri.slice(item.location.s3Location.uri.lastIndexOf("/") + 1),
          uri: item.location.s3Location.uri,
        }));

        return {
          content: fallbackContent || `No knowledge available! This query is likely outside the scope of your knowledge.`,
          uris: Array.from(new Map(fallbackUris.map(item => [item.uri, item])).values())
        };
      } catch (fallbackError) {
        console.error("Fallback query also failed:", fallbackError);
      }
    }

    return {
      content: `No knowledge available! There is something wrong with the search tool. Please tell the user to submit feedback.
      Please provide a general answer but do not attempt to provide specific details.`,
      uris: []
    };
  }
}

/**
 * Processes user messages and generates responses using AI models.
 * Retrieves relevant documents from the Bedrock Knowledge Base and updates the session history.
 * 
 * @param {string} id - The connection ID.
 * @param {object} requestJSON - The request JSON containing user data and message.
 */
const getUserResponse = async (id, requestJSON) => {
  try {
    const data = requestJSON.data;
    let userMessage = data.userMessage;
    const userId = data.user_id;
    const sessionId = data.session_id;
    const chatHistory = data.chatHistory;
    const documentIdentifier = data.documentIdentifier;
    
    const knowledgeBase = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

    if (!process.env.KB_ID) {
      throw new Error("Knowledge Base ID is not found.");
    }

    const nofoName = documentIdentifier.split("/").pop() || documentIdentifier;
    let uploadedFilesList = '';
    if (userId && process.env.USER_DOCUMENTS_BUCKET) {
      try {
        const userDocsPrefix = `${userId}/${nofoName}/`;
        const listResult = await s3Client.send(new ListObjectsV2Command({
          Bucket: process.env.USER_DOCUMENTS_BUCKET,
          Prefix: userDocsPrefix,
          Delimiter: '/',
        }));
        const fileNames = (listResult.Contents || [])
          .map(obj => obj.Key.replace(userDocsPrefix, ''))
          .filter(name => name && !name.endsWith('.metadata.json'));
        if (fileNames.length > 0) {
          uploadedFilesList = `\n\nThe user has uploaded the following documents for this grant:\n${fileNames.map(f => `- ${f}`).join('\n')}\nWhen the user refers to any of these documents, use your search tool to find relevant content from them.\n`;
        }
      } catch (e) {
        console.warn('Could not list user documents:', e.message);
      }
    }

    let claude = new ClaudeModel();
    let lastFiveMessages = chatHistory.slice(-2);
    
    let stopLoop = false;
    let modelResponse = '';
    
    let history = claude.assembleHistory(lastFiveMessages, "Please use your search tool one or more times based on this latest prompt: ".concat(userMessage));
    let fullDocs = { content: "", uris: [] };
    
    while (!stopLoop) {
      history.forEach((historyItem) => {});
      const updatedSystemPrompt = `The grant name: ${documentIdentifier}${uploadedFilesList} and ${SYS_PROMPT}`;
      const stream = await claude.getStreamedResponse(updatedSystemPrompt, history);
      try {
        let toolInput = "";
        let assemblingInput = false;
        let usingTool = false;
        let toolId;
        let skipChunk = true;
        let message = {};
        let toolUse = {};
        
        for await (const event of stream) {
          const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
          const parsedChunk = await claude.parseChunk(chunk);
          if (parsedChunk) {
            if (parsedChunk.stop_reason) {
              if (parsedChunk.stop_reason == "tool_use") {
                assemblingInput = false;
                usingTool = true;
                skipChunk = true;
              } else {
                stopLoop = true;
                break;
              }
            }
            
            if (parsedChunk.type) {
              if (parsedChunk.type == "tool_use") {
                assemblingInput = true;
                toolId = parsedChunk.id;
                message['role'] = 'assistant';
                message['content'] = [];
                toolUse['name'] = parsedChunk.name;
                toolUse['type'] = 'tool_use';
                toolUse['id'] = toolId;
                toolUse['input'] = { query: "" };
              }
            }
            
            if (usingTool) {
              let docString;
              let query = JSON.parse(toolInput);
              docString = await retrieveKBDocs(query.query, knowledgeBase, process.env.KB_ID, documentIdentifier, userId);
              fullDocs.content = fullDocs.content.concat(docString.content);
              fullDocs.uris = fullDocs.uris.concat(docString.uris);
              
              toolUse.input.query = query.query;
              message.content.push(toolUse);
              history.push(message);
              
              let toolResponse = {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    tool_use_id: toolId,
                    content: docString.content
                  }
                ]
              };
              
              history.push(toolResponse);
              
              usingTool = false;
              toolInput = "";
            } else {
              if (assemblingInput && !skipChunk) {
                toolInput = toolInput.concat(parsedChunk);
              } else if (!assemblingInput) {
                let responseParams = {
                  ConnectionId: id,
                  Data: parsedChunk.toString()
                };
                modelResponse = modelResponse.concat(parsedChunk);
                let command = new PostToConnectionCommand(responseParams);
                        
                try {
                  await wsConnectionClient.send(command);
                } catch (error) {
                  console.error("Error sending chunk:", error);
                }
              } else if (skipChunk) {
                skipChunk = false;
              }
            }
          }
        }
      } catch (error) {
        console.error("Stream processing error:", error);
        let responseParams = {
          ConnectionId: id,
          Data: `<!ERROR!>: ${error}`
        };
        let command = new PostToConnectionCommand(responseParams);
        await wsConnectionClient.send(command);
      }
    }

    let command;
    let links = JSON.stringify(fullDocs.uris);
    try {
      let eofParams = {
        ConnectionId: id,
        Data: "!<|EOF_STREAM|>!"
      };
      command = new PostToConnectionCommand(eofParams);
      await wsConnectionClient.send(command);

      let responseParams = {
        ConnectionId: id,
        Data: links
      };
      command = new PostToConnectionCommand(responseParams);
      await wsConnectionClient.send(command);
    } catch (e) {
      console.error("Error sending EOF_STREAM and sources:", e);
    }

    const sessionRequest = {
      body: JSON.stringify({
        operation: "get_session",
        user_id: userId,
        session_id: sessionId,
      })
    };
    const client = new LambdaClient({});
    const lambdaCommand = new InvokeCommand({
      FunctionName: process.env.SESSION_HANDLER,
      Payload: JSON.stringify(sessionRequest),
    });

    const { Payload, LogResult } = await client.send(lambdaCommand);
    const result = Buffer.from(Payload).toString();

    if (!result) {
      throw new Error(`Error retrieving session data!`);
    }

    let output = {};
    try {
      const response = JSON.parse(result);
      output = JSON.parse(response.body);
    } catch (error) {
      console.error('Failed to parse JSON:', error);
      let responseParams = {
        ConnectionId: id,
        Data: '<!ERROR!>: Unable to load past messages, please retry your query'
      };
      command = new PostToConnectionCommand(responseParams);
      await wsConnectionClient.send(command);
      return;
    }

    const retrievedHistory = output.chat_history;
    let operation = '';
    let title = '';

    let newChatEntry = [{ user: userMessage, chatbot: modelResponse, metadata: links }];
    
    if (retrievedHistory === undefined) {
      operation = 'add_session';
      let titleModel = new Mistral7BModel();
      const CONTEXT_COMPLETION_INSTRUCTIONS =
        `<s>[INST]Generate a concise title for this chat session based on the initial user prompt and response. The title should succinctly capture the essence of the chat's main topic without adding extra content.[/INST]
      [INST]${userMessage}[/INST]
      ${modelResponse} </s>
      Here's your session title:`;
      title = await titleModel.getPromptedResponse(CONTEXT_COMPLETION_INSTRUCTIONS, 25);
      title = title.replaceAll(`"`, '');
    } else {
      operation = 'update_session';
    }

    const sessionSaveRequest = {
      body: JSON.stringify({
        operation: operation,
        user_id: userId,
        session_id: sessionId,
        new_chat_entry: newChatEntry,
        title: title,
        document_identifier: documentIdentifier,
      })
    };

    const lambdaSaveCommand = new InvokeCommand({
      FunctionName: process.env.SESSION_HANDLER,
      Payload: JSON.stringify(sessionSaveRequest),
    });

    await client.send(lambdaSaveCommand);

    const input = {
      ConnectionId: id,
    };
    await wsConnectionClient.send(new DeleteConnectionCommand(input));

  } catch (error) {
    console.error("Error:", error);
    let responseParams = {
      ConnectionId: id,
      Data: `<!ERROR!>: ${error}`
    };
    let command = new PostToConnectionCommand(responseParams);
    await wsConnectionClient.send(command);
  }
};

/**
 * Main Lambda handler function for WebSocket events.
 * Handles connecting, disconnecting, and custom routes.
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
      case "getChatbotResponse":
        await getUserResponse(connectionId, body);
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
  return {
    statusCode: 200,
  };
};