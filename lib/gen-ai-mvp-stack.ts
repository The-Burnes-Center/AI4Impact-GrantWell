import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ChatBotApi } from "./chatbot-api";
import { cognitoDomainName } from "./constants"
import { AuthorizationStack } from "./authorization"
import { UserInterface } from "./user-interface"

// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class GenAiMvpStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    
    super(scope, id, props);

    const authentication = new AuthorizationStack(this, "Authorization")
    const chatbotAPI = new ChatBotApi(this, "ChatbotAPI", {authentication});
    const userInterface = new UserInterface(this, "UserInterface",
     {userPoolId : authentication.userPool.userPoolId,
      userPoolClientId : authentication.userPoolClient.userPoolClientId,
      cognitoDomain : cognitoDomainName,
      api : chatbotAPI
    })
    
  }
}
