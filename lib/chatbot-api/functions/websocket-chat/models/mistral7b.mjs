/**
 * This module defines the Mistral7BModel class, which interacts with the Bedrock Runtime API to generate AI responses.
 * It supports assembling chat history, parsing response chunks, and invoking the model for both streamed and non-streamed responses.
 */

import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

export default class Mistral7BModel {
  constructor() {
    this.client = new BedrockRuntimeClient({
      region: "us-east-1",
    });
    this.modelId = 'mistral.mistral-7b-instruct-v0:2';
  }

  /**
   * Assembles the chat history into the required format for the model.
   * 
   * @param {string} system - The system prompt.
   * @param {Array} hist - The chat history.
   * @param {string} prompt - The user prompt.
   * @returns {string} - The assembled history.
   */
  assembleHistory(system, hist, prompt) {
    let history = "";
    history = history.concat(`<s>[INST]\n ${system} [/INST]\n`);
    hist.forEach((element) => {
      history = history.concat(`[INST]\n ${element.user} [/INST]\n`);
      history = history.concat(`${element.chatbot}`);
    });
    history = history.concat(`\n </s>[INST]\n ${prompt} [/INST]\n\n`);
    return history;
  }

  /**
   * Parses a chunk of the response from the model.
   * 
   * @param {object} chunk - The response chunk.
   * @returns {string} - The parsed chunk.
   */
  parseChunk(chunk) {
    return chunk.generation;
  }

  /**
   * Invokes the model with a payload and returns a streamed response.
   * 
   * @param {string} system - The system prompt.
   * @param {Array} history - The chat history.
   * @param {string} message - The user message.
   * @returns {ReadableStream} - The response stream.
   */
  async getStreamedResponse(system, history, message) {
    const hist = this.assembleHistory(system, history, message);
    const payload = {
      prompt: hist,
      max_tokens: 2000,
      temperature: 0.05,
    };
    // Invoke the model with the payload and wait for the API to respond.
    const command = new InvokeModelWithResponseStreamCommand({
      contentType: "application/json",
      body: JSON.stringify(payload),
      modelId: this.modelId,
    });
    const apiResponse = await this.client.send(command);
    console.log(apiResponse.body);
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
    const hist = this.assembleHistory(system, history, message);
    const payload = {
      prompt: hist,
      max_tokens: 999,
      temperature: 0.05,
    };
    // Invoke the model with the payload and wait for the API to respond.
    const command = new InvokeModelCommand({
      contentType: "application/json",
      body: JSON.stringify(payload),
      modelId: this.modelId,
    });
    const apiResponse = await this.client.send(command);
    return JSON.parse(new TextDecoder().decode(apiResponse.body)).outputs[0].text;
  }

  /**
   * Invokes the model with a payload and returns a non-streamed response based on a prompt.
   * 
   * @param {string} prompt - The prompt text.
   * @param {number} len - The maximum generation length.
   * @returns {string} - The model response.
   */
  async getPromptedResponse(prompt, len) {
    const payload = {
      prompt: prompt,
      max_tokens: len,
      temperature: 0,
      stop: ["?\n", '?"\n'],
    };
    // Invoke the model with the payload and wait for the API to respond.
    const command = new InvokeModelCommand({
      contentType: "application/json",
      body: JSON.stringify(payload),
      modelId: this.modelId,
    });
    const apiResponse = await this.client.send(command);
    const output = JSON.parse(new TextDecoder().decode(apiResponse.body));
    console.log(output);
    return output.outputs[0].text;
  }
}