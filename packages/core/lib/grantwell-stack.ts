/**
 * This file defines the main stack for the GrantWell application using AWS CDK.
 * It sets up the authorization stack, chatbot API, and user interface, integrating them with Cognito for user authentication.
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ChatBotApi } from "./chatbot-api";
import { AuthorizationStack } from "./authorization";
import { UserInterface } from "./user-interface";
import { InstanceConfig } from "./config/instance-config";

export interface GrantWellStackProps extends cdk.StackProps {
  readonly config: InstanceConfig;
  /** UI project directory; copied before building, never written to. */
  readonly uiSourceDir: string;
}

export class GrantWellStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GrantWellStackProps) {
    super(scope, id, props);

    // Set environment variable for Grants.gov API key
    const grantsGovApiKey = process.env.GRANTS_GOV_API_KEY;
    if (!grantsGovApiKey) {
      throw new Error('GRANTS_GOV_API_KEY environment variable is required');
    }

    const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!turnstileSecretKey) {
      throw new Error('TURNSTILE_SECRET_KEY environment variable is required');
    }

    if (!process.env.TURNSTILE_SITE_KEY) {
      throw new Error('TURNSTILE_SITE_KEY environment variable is required');
    }

    // Create the authorization stack
    const authentication = new AuthorizationStack(this, "Authorization", {
      config: props.config,
      turnstileSecretKey,
    });

    // Create the chatbot API and pass the authentication stack
    const chatbotAPI = new ChatBotApi(this, "ChatbotAPI", { 
      config: props.config,
      authentication,
      grantsGovApiKey 
    });

    // Create the user interface and pass necessary properties
    new UserInterface(this, "UserInterface", {
      config: props.config,
      uiSourceDir: props.uiSourceDir,
      userPoolId: authentication.userPool.userPoolId,
      userPoolClientId: authentication.userPoolClient.userPoolClientId,
      cognitoDomain: props.config.aws.cognitoDomainPrefix,
      api: chatbotAPI
    });
  }
}
