/**
 * This file defines the main stack for the Gen AI MVP application using AWS CDK.
 * It sets up the authorization stack, chatbot API, and user interface, integrating them with Cognito for user authentication.
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ChatBotApi } from "./chatbot-api";
import { cognitoDomainName } from "./constants";
import { AuthorizationStack } from "./authorization";
import { UserInterface } from "./user-interface";

export class GenAiMvpStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Set environment variable for Grants.gov API key
    const grantsGovApiKey = process.env.GRANTS_GOV_API_KEY;
    if (!grantsGovApiKey) {
      throw new Error('GRANTS_GOV_API_KEY environment variable is required');
    }

    // Create the authorization stack
    const authentication = new AuthorizationStack(this, "Authorization");

    // Create the chatbot API and pass the authentication stack
    const chatbotAPI = new ChatBotApi(this, "ChatbotAPI", { 
      authentication,
      grantsGovApiKey 
    });

    // Create the user interface and pass necessary properties
    const userInterface = new UserInterface(this, "UserInterface", {
      userPoolId: authentication.userPool.userPoolId,
      userPoolClientId: authentication.userPoolClient.userPoolClientId,
      cognitoDomain: cognitoDomainName,
      api: chatbotAPI
    });
  }
}
