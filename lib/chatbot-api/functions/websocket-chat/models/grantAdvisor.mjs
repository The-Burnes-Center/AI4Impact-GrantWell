/**
 * GrantAdvisor.mjs
 * 
 * This module handles the grant recommendation functionality through the WebSocket API.
 * It integrates with the grant-recommendation Lambda to provide grant matches based on user queries.
 * Now enhanced to use the Bedrock Knowledge Base for more accurate recommendations.
 */

import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

// Lambda client for invoking the grant recommendation function
const lambdaClient = new LambdaClient({ region: "us-east-1" });

/**
 * GrantAdvisor class for processing grant recommendation requests
 */
export default class GrantAdvisor {
  /**
   * Constructor for the GrantAdvisor class
   * 
   * @param {string} endpoint - API Gateway management API endpoint
   */
  constructor(endpoint) {
    this.wsClient = new ApiGatewayManagementApiClient({ endpoint });
  }
  
  /**
   * Process a grant recommendation query and send results via WebSocket
   * 
   * @param {string} connectionId - WebSocket connection ID
   * @param {string} query - User's grant search query
   * @param {object} userPreferences - Optional preferences to filter results
   * @returns {void}
   */
  async processQuery(connectionId, query, userPreferences = {}) {
    try {
      // First send an acknowledgment that we're processing
      await this.sendMessage(connectionId, {
        type: 'processing',
        message: 'Searching for matching grants using Knowledge Base...'
      });
      
      // Invoke the grant recommendation Lambda function with the KB-enabled implementation
      const payload = {
        body: JSON.stringify({
          query,
          userPreferences
        })
      };
      
      console.log(`Invoking grant recommendation function with query: "${query}"`);
      
      const command = new InvokeCommand({
        FunctionName: process.env.GRANT_RECOMMENDATION_FUNCTION,
        Payload: JSON.stringify(payload)
      });
      
      // Send the command and get the response
      const response = await lambdaClient.send(command);
      
      // Parse the Lambda response
      const responsePayload = JSON.parse(Buffer.from(response.Payload).toString());
      
      console.log('Grant recommendation response status:', responsePayload.statusCode);
      
      if (responsePayload.statusCode >= 400) {
        const body = JSON.parse(responsePayload.body);
        throw new Error(body.error || 'Unknown error processing recommendations');
      }
      
      const body = JSON.parse(responsePayload.body);
      
      // Handle case where no grants were found
      if (!body.grants || body.grants.length === 0) {
        await this.sendMessage(connectionId, {
          type: 'error',
          message: "No matching grants found. Please provide more specific criteria."
        });
        return;
      }
      
      // Map the grant recommendations to the format expected by the frontend
      const grantRecommendations = body.grants.map(grant => ({
        id: grant.name,
        name: grant.name,
        deadline: grant.deadline,
        keyRequirements: grant.keyRequirements || [],
        summaryUrl: grant.summaryUrl,
        // Add default values for fields the frontend expects
        matchScore: 100, // Default high score
        matchReason: "This grant matches your requirements",
        eligibilityMatch: true,
        fundingAmount: "Not specified"
      }));
      
      // Generate a response message based on the number of results
      let content;
      if (grantRecommendations.length === 1) {
        const grant = grantRecommendations[0];
        content = `I found a grant that matches your requirements: "${grant.name}".`;
      } else {
        content = `I found ${grantRecommendations.length} grants that match your requirements. The top match is "${grantRecommendations[0].name}".`;
      }
      
      // Send the final response with recommendations
      await this.sendMessage(connectionId, {
        type: 'grant_recommendations',
        grants: grantRecommendations,
        content: content
      });
      
      // Send end stream message
      await this.sendMessage(connectionId, {
        type: 'end_stream'
      });
      
    } catch (error) {
      console.error('Error in GrantAdvisor:', error);
      
      // Send error message back to the client
      await this.sendMessage(connectionId, {
        type: 'error',
        message: `Error processing grant recommendations: ${error.message}`
      });
    }
  }
  
  /**
   * Send a message over the WebSocket connection
   * 
   * @param {string} connectionId - WebSocket connection ID
   * @param {object} message - Message to send
   * @returns {Promise<void>}
   */
  async sendMessage(connectionId, message) {
    const params = {
      ConnectionId: connectionId,
      Data: JSON.stringify(message)
    };
    
    try {
      const command = new PostToConnectionCommand(params);
      await this.wsClient.send(command);
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      if (error.name === 'GoneException') {
        // Connection is no longer available, handle gracefully
        console.log(`Connection ${connectionId} is gone, cannot send message`);
      } else {
        throw error;
      }
    }
  }
}