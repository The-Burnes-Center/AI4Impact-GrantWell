/**
 * This module defines the ClaudeModel class, which interacts with the Bedrock Runtime API to generate AI responses.
 * It supports assembling chat history, parsing response chunks, and invoking the model for both streamed and non-streamed responses.
 */

import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
  InvokeModelCommand
} from "@aws-sdk/client-bedrock-runtime";

export default class ClaudeModel {
  constructor() {
    this.client = new BedrockRuntimeClient({
      region: "us-east-1",
    });
    this.modelId = "us.anthropic.claude-sonnet-4-20250514-v1:0";
  }

  /**
   * Assembles the chat history into the required format for the model.
   * 
   * @param {Array} hist - The chat history.
   * @param {string} prompt - The user prompt.
   * @returns {Array} - The assembled history.
   */
  assembleHistory(hist, prompt) {
    var history = [];
    hist.forEach((element) => {
      history.push({ "role": "user", "content": [{ "type": "text", "text": element.user }] });
      history.push({ "role": "assistant", "content": [{ "type": "text", "text": element.chatbot }] });
    });
    history.push({ "role": "user", "content": [{ "type": "text", "text": prompt }] });
    return history;
  }

  /**
   * Parses a chunk of the response from the model.
   * 
   * @param {object} chunk - The response chunk.
   * @returns {string|object} - The parsed chunk.
   */
  parseChunk(chunk) {
    if (chunk.type == 'content_block_delta') {
      if (chunk.delta.type == 'text_delta') {
        return chunk.delta.text;
      }
      if (chunk.delta.type == "input_json_delta") {
        return chunk.delta.partial_json;
      }
    } else if (chunk.type == "content_block_start") {
      if (chunk.content_block.type == "tool_use") {
        return chunk.content_block;
      }
    } else if (chunk.type == "message_delta") {
      if (chunk.delta.stop_reason == "tool_use") {
        return chunk.delta;
      } else {
        return chunk.delta;
      }
    }
  }

  /**
   * Invokes the model with a payload and returns a streamed response.
   * 
   * @param {string} system - The system prompt.
   * @param {Array} history - The chat history.
   * @returns {ReadableStream} - The response stream.
   */
  async getStreamedResponse(system, history) {
    const payload = {
      "anthropic_version": "bedrock-2023-05-31",
      "system": system,
      "max_tokens": 2048,
      "messages": history,
      "temperature": 0.01,
      "tools": [
        {
          "name": "query_db",
          "description": "Query a vector database for any information in your knowledge base. Try to use specific key words when possible.",
          "input_schema": {
            "type": "object",
            "properties": {
              "query": {
                "type": "string",
                "description": "The query you want to make to the vector database."
              }
            },
            "required": [
              "query"
            ]
          }
        }
      ],
    };

    try {
      const command = new InvokeModelWithResponseStreamCommand({ body: JSON.stringify(payload), contentType: 'application/json', modelId: this.modelId });
      const apiResponse = await this.client.send(command);
      return apiResponse.body;
    } catch (e) {
      console.error("Caught error: model invoke error", e);
    }
  }

  /**
   * Invokes the model with a payload and returns a non-streamed response.
   * 
   * @param {string} system - The system prompt.
   * @param {Array} history - The chat history.
   * @param {string} message - The user message.
   * @returns {string} - The model response.
   */
  async getResponse(system, history, message) {
    const hist = this.assembleHistory(history, message);
    const payload = {
      "anthropic_version": "bedrock-2023-05-31",
      "system": system,
      "max_tokens": 2048,
      "messages": hist,
      "temperature": 0,
      "amazon-bedrock-guardrailDetails": {
        "guardrailId": "ii43q6095rvh",
        "guardrailVersion": "Version 1"
      }
    };

    try {
      const command = new InvokeModelCommand({
        contentType: "application/json",
        body: JSON.stringify(payload),
        modelId: this.modelId,
      });
      const apiResponse = await this.client.send(command);
      console.log(new TextDecoder().decode(apiResponse.body));
      return JSON.parse(new TextDecoder().decode(apiResponse.body)).content[0].text;
    } catch (e) {
      console.error("Caught error: model invoke error", e);
    }
  }
}