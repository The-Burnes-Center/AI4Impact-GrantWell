/**
 * GrantAdvisor.mjs
 * 
 * This module handles the grant recommendation functionality through the WebSocket API.
 * It integrates with the grant-recommendation Lambda to provide grant matches based on user queries.
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
        message: 'Searching for matching grants...'
      });
      
      // Invoke the grant recommendation Lambda function
      const payload = {
        body: JSON.stringify({
          query,
          userPreferences
        })
      };
      
      const command = new InvokeCommand({
        FunctionName: process.env.GRANT_RECOMMENDATION_FUNCTION,
        Payload: JSON.stringify(payload)
      });
      
      // Send the command and get the response
      const response = await lambdaClient.send(command);
      
      // Parse the Lambda response
      const responsePayload = JSON.parse(Buffer.from(response.Payload).toString());
      const body = JSON.parse(responsePayload.body);
      
      if (responsePayload.statusCode >= 400) {
        throw new Error(body.error || 'Unknown error processing recommendations');
      }
      
      // Map the grant recommendations to the format expected by the frontend
      const grantRecommendations = body.grants.map(grant => ({
        id: grant.grantId,
        name: grant.name,
        matchScore: grant.matchScore,
        eligibilityMatch: grant.eligibilityMatch,
        fundingAmount: grant.fundingAmount,
        deadline: grant.deadline,
        keyRequirements: grant.keyRequirements,
        summaryUrl: grant.summaryUrl
      }));
      
      // Generate a response message based on the number of results
      let content;
      if (grantRecommendations.length === 0) {
        content = "I couldn't find any grants matching your criteria. Could you provide more details about what you're looking for?";
      } else if (grantRecommendations.length === 1) {
        content = `I found a grant that matches your needs: ${grantRecommendations[0].name}`;
      } else {
        content = `I found ${grantRecommendations.length} grants that match your requirements:`;
      }
      
      // Send the final response with recommendations
      await this.sendMessage(connectionId, {
        type: 'ai',
        content,
        metadata: {
          grantRecommendations,
          suggestedQuestions: body.suggestedQuestions || []
        }
      });
      
    } catch (error) {
      console.error('Error in GrantAdvisor:', error);
      
      // Send error message back to the client
      await this.sendMessage(connectionId, {
        type: 'error',
        content: `Sorry, I encountered an issue while searching for grants. Please try again.`,
        metadata: {
          suggestedQuestions: [
            "What types of grants are available for municipalities?",
            "Can you show me infrastructure grants?",
            "What grants are available for community development?"
          ]
        }
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