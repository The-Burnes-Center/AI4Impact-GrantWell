/**
 * This module defines the ClaudeModel class, which interacts with the Bedrock Runtime API to generate AI responses.
 * It supports assembling chat history, parsing response chunks, and invoking the model for both streamed and non-streamed responses.
 */

import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
  InvokeModelCommand
} from "@aws-sdk/client-bedrock-runtime";

// Sonnet 5.5 rejects thinking "disabled"; between_tools is its lowest setting. With
// between_tools the effort must not change within a conversation, so every request uses it.
const THINKING = { type: "between_tools" };
const OUTPUT_CONFIG = { effort: "medium" };

export default class ClaudeModel {
  constructor() {
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.modelId = process.env.SONNET_MODEL_ID;
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
   * Reads a response stream into API-ready assistant content blocks, in stream order.
   * Only text deltas of text blocks reach onText; thinking blocks are kept whole
   * (text + signature) so the tool loop can send them back unchanged.
   *
   * @param {AsyncIterable} stream - The Bedrock response stream.
   * @param {function(string): Promise<void>} onText - Called with each answer text delta.
   * @returns {Promise<{content: Array, stopReason: string|undefined, stopDetails: object|undefined}>}
   */
  async readStream(stream, onText) {
    const content = [];
    const toolJson = new Map();
    let current = null;
    let stopReason;
    let stopDetails;

    const start = (block) => {
      current = block;
      content.push(block);
      return block;
    };

    for await (const event of stream) {
      const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
      if (chunk.type == "content_block_start") {
        const block = start({ ...chunk.content_block });
        if (block.type == "tool_use") toolJson.set(block, "");
      } else if (chunk.type == "content_block_delta") {
        const delta = chunk.delta;
        if (delta.type == "text_delta") {
          const block = current?.type == "text" ? current : start({ type: "text", text: "" });
          block.text = (block.text || "").concat(delta.text);
          await onText(delta.text);
        } else if (delta.type == "thinking_delta") {
          const block = current?.type == "thinking" ? current : start({ type: "thinking", thinking: "", signature: "" });
          block.thinking = (block.thinking || "").concat(delta.thinking);
        } else if (delta.type == "signature_delta" && current?.type == "thinking") {
          current.signature = (current.signature || "").concat(delta.signature);
        } else if (delta.type == "input_json_delta" && toolJson.has(current)) {
          toolJson.set(current, toolJson.get(current).concat(delta.partial_json));
        }
      } else if (chunk.type == "content_block_stop") {
        current = null;
      } else if (chunk.type == "message_delta" && chunk.delta?.stop_reason) {
        stopReason = chunk.delta.stop_reason;
        stopDetails = chunk.delta.stop_details;
        break;
      }
    }

    for (const [block, raw] of toolJson) {
      if (!raw) {
        block.input ??= {};
        continue;
      }
      try {
        block.input = JSON.parse(raw);
      } catch (e) {
        console.error(`Failed to parse tool input for ${block.id}: ${JSON.stringify(raw)}`, e);
        block.input = { query: "" };
      }
    }

    // The API rejects empty or whitespace-only text blocks when they are sent back.
    return {
      content: content.filter((b) => b.type != "text" || (b.text || "").trim()),
      stopReason,
      stopDetails,
    };
  }

  /**
   * Invokes the model with a payload and returns a streamed response.
   * 
   * @param {string} system - The system prompt.
   * @param {Array} history - The chat history.
   * @param {object} [toolChoice] - Anthropic tool_choice, e.g. { type: "none" }.
   * @returns {ReadableStream} - The response stream.
   */
  async getStreamedResponse(system, history, toolChoice) {
    const payload = {
      "anthropic_version": "bedrock-2023-05-31",
      "system": system,
      "max_tokens": 8192,
      "messages": history,
      "thinking": THINKING,
      "output_config": OUTPUT_CONFIG,
      "tools": [
        {
          "name": "query_db",
          "description": "Search the active grant's documents for passages relevant to a query. It searches only the grant document for the grant this chat is about and the supporting documents the user uploaded for that grant; it does not search the web, other grants, or regulations. It returns the text of up to about 12 matching passages joined together, drops passages below a relevance threshold, and does not guarantee section or page locators. When nothing matches it returns a short notice saying so; that notice means only that this query found nothing. Use one focused query per topic, and run several searches when a question spans several requirements.",
          "input_schema": {
            "type": "object",
            "properties": {
              "query": {
                "type": "string",
                "description": "A focused query naming the requirement you need, in plain words or keywords, for example 'cost share waiver conditions' or 'application submission deadline'."
              }
            },
            "required": [
              "query"
            ]
          }
        }
      ],
    };
    if (toolChoice) payload.tool_choice = toolChoice;

    const command = new InvokeModelWithResponseStreamCommand({ body: JSON.stringify(payload), contentType: 'application/json', modelId: this.modelId });
    const apiResponse = await this.client.send(command);
    return apiResponse.body;
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
      "max_tokens": 8192,
      "messages": hist,
      "thinking": THINKING,
      "output_config": OUTPUT_CONFIG,
    };

    try {
      const command = new InvokeModelCommand({
        contentType: "application/json",
        body: JSON.stringify(payload),
        modelId: this.modelId,
      });
      const apiResponse = await this.client.send(command);
      const body = JSON.parse(new TextDecoder().decode(apiResponse.body));
      console.log(JSON.stringify(body));
      if (body.stop_reason == "refusal") {
        console.warn(`Model refused the request (category: ${body.stop_details?.category ?? "none"})`);
        return;
      }
      return body.content.filter((b) => b.type == "text").map((b) => b.text).join("");
    } catch (e) {
      console.error("Caught error: model invoke error", e);
    }
  }
}