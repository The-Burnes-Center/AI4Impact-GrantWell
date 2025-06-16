/**
 * This file defines a construct for creating and configuring an AWS Cognito User Pool for user authentication.
 * It includes the setup of a Cognito domain, a user pool client, and an optional Azure OIDC identity provider.
 * Additionally, it configures a Lambda function to act as a custom authorizer for the WebSocket API.
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { cognitoDomainName } from '../constants';
import { UserPool, UserPoolClient, FeaturePlan} from 'aws-cdk-lib/aws-cognito';
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';

export class AuthorizationStack extends Construct {
  public readonly lambdaAuthorizer: lambda.Function;
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id);

    // Create the Cognito User Pool
    const userPool = new UserPool(this, 'UserPool', {      
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      selfSignUpEnabled: false,
      mfa: cognito.Mfa.OPTIONAL,
      featurePlan: FeaturePlan.PLUS,
      autoVerify: { email: true, phone: true },
      signInAliases: {
        email: true,
      },
      customAttributes: {
        'role': new cognito.StringAttribute({ minLen: 0, maxLen: 30, mutable: true })
      },
      // Add custom invitation messages
      userInvitation: {
        emailSubject: 'Welcome to GrantWell!',
        emailBody:
          'Hello,<br><br>' +
          'I am pleased to inform you that the new custom deployment link for the GrantWell tool is now ready for testing. All future updates and changes will be applied to this new link.<br><br>' +
          'Please note that the tool is still under development, so you may encounter errors. We kindly request that you record any feedback regarding the tool’s performance.<br><br>' +
          'Below, you will find the necessary information for signing into the tool:<br><br>' +
          '<strong>First-Time Sign-In:</strong><br>' +
          'Please use the following link when signing in for the first time:<br>' +
          '<a href="https://gw-auth.auth.us-east-1.amazoncognito.com/login?client_id=375cvc5uaol6jm9jm1jte11kpr&response_type=code&scope=aws.cognito.signin.user.admin+email+openid+phone+profile&redirect_uri=https://d17w6od3455cz1.cloudfront.net">First Time Sign-In Link</a><br><br>' +
          '<strong>Regular Access:</strong><br>' +
          'Once registered, you can use the regular custom deployment link:<br>' +
          '<a href="https://d17w6od3455cz1.cloudfront.net">Regular Custom Deployment Link</a><br><br>' +
          '<strong>Login Credentials:</strong><br>' +
          'Username: {username}<br>' +
          'Temporary Password: {####}<br><br>' +
          'Thank you,<br>' +
          'The GrantWell Team',
        smsMessage: 'Hello {username}, your temporary password for GrantWell is {####}'
      }
    });
    this.userPool = userPool;

    userPool.addDomain('CognitoDomain', {
      cognitoDomain: {
        domainPrefix: cognitoDomainName,
      },
    });

    const userPoolClient = new UserPoolClient(this, 'UserPoolClient', {
      userPool,      
    });

    this.userPoolClient = userPoolClient;

    const authorizerHandlerFunction = new lambda.Function(this, 'AuthorizationFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset(path.join(__dirname, 'websocket-api-authorizer')), // Points to the lambda directory
      handler: 'lambda_function.lambda_handler', // Points to the 'hello' file in the lambda directory
      environment: {
        "USER_POOL_ID" : userPool.userPoolId,
        "APP_CLIENT_ID" : userPoolClient.userPoolClientId
      },
      timeout: cdk.Duration.seconds(30)
    });

    this.lambdaAuthorizer = authorizerHandlerFunction;
    
    new cdk.CfnOutput(this, "UserPool ID", {
      value: userPool.userPoolId || "",
    });

    new cdk.CfnOutput(this, "UserPool Client ID", {
      value: userPoolClient.userPoolClientId || "",
    });
  }
}
