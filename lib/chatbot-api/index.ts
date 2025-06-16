/**
 * This file defines the main construct for the ChatBot API using AWS CDK.
 * It sets up the WebSocket and REST APIs, integrates various Lambda functions,
 * and configures DynamoDB tables and S3 buckets for storing chat history, user feedback, and NOFO data.
 */

import * as cdk from "aws-cdk-lib";
import { AuthorizationStack } from "../authorization";
import { WebsocketBackendAPI } from "./gateway/websocket-api";
import { RestBackendAPI } from "./gateway/rest-api";
import { LambdaFunctionStack } from "./functions/functions";
import { TableStack } from "./tables/tables";
import { S3BucketStack } from "./buckets/buckets";
import {
  WebSocketLambdaIntegration,
  HttpLambdaIntegration,
} from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {
  WebSocketLambdaAuthorizer,
  HttpJwtAuthorizer,
} from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { aws_apigatewayv2 as apigwv2 } from "aws-cdk-lib";
import { Construct } from "constructs";
import { OpenSearchStack } from "./opensearch/opensearch";
import { KnowledgeBaseStack } from "./knowledge-base/knowledge-base";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";

export interface ChatbotAPIProps {
  readonly authentication: AuthorizationStack;
}

export class ChatBotApi extends Construct {
  public readonly httpAPI: RestBackendAPI;
  public readonly wsAPI: WebsocketBackendAPI;

  constructor(scope: Construct, id: string, props: ChatbotAPIProps) {
    super(scope, id);

    const tables = new TableStack(this, "TableStack");
    const buckets = new S3BucketStack(this, "BucketStack");
    const openSearch = new OpenSearchStack(this, "OpenSearchStack", {});
    const knowledgeBase = new KnowledgeBaseStack(this, "KnowledgeBaseStack", {
      openSearch: openSearch,
      s3bucket: buckets.ffioNofosBucket,
    });

    const restBackend = new RestBackendAPI(this, "RestBackend", {});
    this.httpAPI = restBackend;
    const websocketBackend = new WebsocketBackendAPI(
      this,
      "WebsocketBackend",
      {}
    );
    this.wsAPI = websocketBackend;

    const lambdaFunctions = new LambdaFunctionStack(this, "LambdaFunctions", {
      wsApiEndpoint: websocketBackend.wsAPIStage.url,
      sessionTable: tables.historyTable,
      feedbackTable: tables.feedbackTable,
      draftTable: tables.draftTable,
      feedbackBucket: buckets.feedbackBucket,
      knowledgeBase: knowledgeBase.knowledgeBase,
      knowledgeBaseSource: knowledgeBase.dataSource,
      ffioNofosBucket: buckets.ffioNofosBucket,
    });

    const wsAuthorizer = new WebSocketLambdaAuthorizer(
      "WebSocketAuthorizer",
      props.authentication.lambdaAuthorizer,
      {
        identitySource: ["route.request.querystring.Authorization"],
      }
    );

    websocketBackend.wsAPI.addRoute("getChatbotResponse", {
      integration: new WebSocketLambdaIntegration(
        "chatbotResponseIntegration",
        lambdaFunctions.chatFunction
      ),
    });

    websocketBackend.wsAPI.addRoute("$connect", {
      integration: new WebSocketLambdaIntegration(
        "chatbotConnectionIntegration",
        lambdaFunctions.chatFunction
      ),
      authorizer: wsAuthorizer,
    });
    websocketBackend.wsAPI.addRoute("$default", {
      integration: new WebSocketLambdaIntegration(
        "chatbotConnectionIntegration",
        lambdaFunctions.chatFunction
      ),
    });
    websocketBackend.wsAPI.addRoute("$disconnect", {
      integration: new WebSocketLambdaIntegration(
        "chatbotDisconnectionIntegration",
        lambdaFunctions.chatFunction
      ),
    });

    websocketBackend.wsAPI.grantManageConnections(lambdaFunctions.chatFunction);

    const httpAuthorizer = new HttpJwtAuthorizer(
      "HTTPAuthorizer",
      props.authentication.userPool.userPoolProviderUrl,
      {
        jwtAudience: [props.authentication.userPoolClient.userPoolClientId],
      }
    );

    const sessionAPIIntegration = new HttpLambdaIntegration(
      "SessionAPIIntegration",
      lambdaFunctions.sessionFunction
    );
    restBackend.restAPI.addRoutes({
      path: "/user-session",
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.POST,
        apigwv2.HttpMethod.DELETE,
      ],
      integration: sessionAPIIntegration,
      authorizer: httpAuthorizer,
    });

    // Add draft editor Lambda integration
    const draftAPIIntegration = new HttpLambdaIntegration(
      "DraftAPIIntegration",
      lambdaFunctions.draftFunction
    );
    restBackend.restAPI.addRoutes({
      path: "/user-draft",
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.POST,
        apigwv2.HttpMethod.DELETE,
      ],
      integration: draftAPIIntegration,
      authorizer: httpAuthorizer,
    });

    lambdaFunctions.chatFunction.addEnvironment(
      "SESSION_HANDLER",
      lambdaFunctions.sessionFunction.functionName
    );

    const feedbackAPIIntegration = new HttpLambdaIntegration(
      "FeedbackAPIIntegration",
      lambdaFunctions.feedbackFunction
    );
    restBackend.restAPI.addRoutes({
      path: "/user-feedback",
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.POST,
        apigwv2.HttpMethod.DELETE,
      ],
      integration: feedbackAPIIntegration,
      authorizer: httpAuthorizer,
    });

    const feedbackAPIDownloadIntegration = new HttpLambdaIntegration(
      "FeedbackDownloadAPIIntegration",
      lambdaFunctions.feedbackFunction
    );
    restBackend.restAPI.addRoutes({
      path: "/user-feedback/download-feedback",
      methods: [apigwv2.HttpMethod.POST],
      integration: feedbackAPIDownloadIntegration,
      authorizer: httpAuthorizer,
    });

    const s3GetAPIIntegration = new HttpLambdaIntegration(
      "S3GetAPIIntegration",
      lambdaFunctions.getS3Function
    );
    restBackend.restAPI.addRoutes({
      path: "/s3-bucket-data",
      methods: [apigwv2.HttpMethod.POST],
      integration: s3GetAPIIntegration,
      authorizer: httpAuthorizer,
    });

    const s3GetNofosAPIIntegration = new HttpLambdaIntegration(
      "S3GetNofosAPIIntegration",
      lambdaFunctions.getNOFOsList
    );
    restBackend.restAPI.addRoutes({
      path: "/s3-nofo-bucket-data",
      methods: [apigwv2.HttpMethod.GET],
      integration: s3GetNofosAPIIntegration,
      authorizer: httpAuthorizer,
    });

    const s3GetNofoSummaryAPIIntegration = new HttpLambdaIntegration(
      "S3GetNofoSummaryAPIIntegration",
      lambdaFunctions.getNOFOSummary
    );
    restBackend.restAPI.addRoutes({
      path: "/s3-nofo-summary",
      methods: [apigwv2.HttpMethod.GET],
      integration: s3GetNofoSummaryAPIIntegration,
      authorizer: httpAuthorizer,
    });

    const s3DeleteAPIIntegration = new HttpLambdaIntegration(
      "S3DeleteAPIIntegration",
      lambdaFunctions.deleteS3Function
    );
    restBackend.restAPI.addRoutes({
      path: "/delete-s3-file",
      methods: [apigwv2.HttpMethod.POST],
      integration: s3DeleteAPIIntegration,
      authorizer: httpAuthorizer,
    });

    const s3UploadAPIIntegration = new HttpLambdaIntegration(
      "S3UploadAPIIntegration",
      lambdaFunctions.uploadS3Function
    );
    restBackend.restAPI.addRoutes({
      path: "/signed-url",
      methods: [apigwv2.HttpMethod.POST],
      integration: s3UploadAPIIntegration,
      authorizer: httpAuthorizer,
    });

    const s3UploadNOFOAPIIntegration = new HttpLambdaIntegration(
      "nofoUploadS3APIHandlerFunction",
      lambdaFunctions.uploadNOFOS3Function
    );
    restBackend.restAPI.addRoutes({
      path: "/test-url",
      methods: [apigwv2.HttpMethod.POST],
      integration: s3UploadNOFOAPIIntegration,
      authorizer: httpAuthorizer,
    });

    const kbSyncProgressAPIIntegration = new HttpLambdaIntegration(
      "KBSyncAPIIntegration",
      lambdaFunctions.syncKBFunction
    );
    restBackend.restAPI.addRoutes({
      path: "/kb-sync/still-syncing",
      methods: [apigwv2.HttpMethod.GET],
      integration: kbSyncProgressAPIIntegration,
      authorizer: httpAuthorizer,
    });

    const kbSyncAPIIntegration = new HttpLambdaIntegration(
      "KBSyncAPIIntegration",
      lambdaFunctions.syncKBFunction
    );
    restBackend.restAPI.addRoutes({
      path: "/kb-sync/sync-kb",
      methods: [apigwv2.HttpMethod.GET],
      integration: kbSyncAPIIntegration,
      authorizer: httpAuthorizer,
    });

    const kbLastSyncAPIIntegration = new HttpLambdaIntegration(
      "KBLastSyncAPIIntegration",
      lambdaFunctions.syncKBFunction
    );
    restBackend.restAPI.addRoutes({
      path: "/kb-sync/get-last-sync",
      methods: [apigwv2.HttpMethod.GET],
      integration: kbLastSyncAPIIntegration,
      authorizer: httpAuthorizer,
    });

    // Add REST API route for grant recommendations
    const grantRecommendationAPIIntegration = new HttpLambdaIntegration(
      "GrantRecommendationAPIIntegration",
      lambdaFunctions.grantRecommendationFunction
    );
    restBackend.restAPI.addRoutes({
      path: "/grant-recommendations",
      methods: [apigwv2.HttpMethod.POST],
      integration: grantRecommendationAPIIntegration,
      authorizer: httpAuthorizer,
    });

    // Add REST API route for NOFO status updates
    const nofoStatusAPIIntegration = new HttpLambdaIntegration(
      "NofoStatusAPIIntegration",
      lambdaFunctions.nofoStatusFunction
    );
    restBackend.restAPI.addRoutes({
      path: "/s3-nofo-status",
      methods: [apigwv2.HttpMethod.POST],
      integration: nofoStatusAPIIntegration,
      authorizer: httpAuthorizer,
    });

    // Add REST API route for NOFO questions
    const nofoQuestionsAPIIntegration = new HttpLambdaIntegration(
      "NofoQuestionsAPIIntegration",
      lambdaFunctions.getNOFOQuestions
    );
    restBackend.restAPI.addRoutes({
      path: "/s3-nofo-questions",
      methods: [apigwv2.HttpMethod.GET],
      integration: nofoQuestionsAPIIntegration,
      authorizer: httpAuthorizer,
    });

    const nofoRenameAPIIntegration = new HttpLambdaIntegration(
      "NofoRenameAPIIntegration",
      lambdaFunctions.nofoRenameFunction
    );
    restBackend.restAPI.addRoutes({
      path: "/s3-nofo-rename",
      methods: [apigwv2.HttpMethod.POST],
      integration: nofoRenameAPIIntegration,
      authorizer: httpAuthorizer,
    });

    const nofoDeleteAPIIntegration = new HttpLambdaIntegration(
      "NofoDeleteAPIIntegration",
      lambdaFunctions.nofoDeleteFunction
    );
    restBackend.restAPI.addRoutes({
      path: "/s3-nofo-delete",
      methods: [apigwv2.HttpMethod.DELETE],
      integration: nofoDeleteAPIIntegration,
      authorizer: httpAuthorizer,
    });

    // Add REST API route for draft generation
    const draftGeneratorAPIIntegration = new HttpLambdaIntegration(
      "DraftGeneratorAPIIntegration",
      lambdaFunctions.draftGeneratorFunction
    );
    restBackend.restAPI.addRoutes({
      path: "/draft-generation",
      methods: [apigwv2.HttpMethod.POST],
      integration: draftGeneratorAPIIntegration,
      authorizer: httpAuthorizer,
    });

    const inviteUserFunction = new lambda.Function(this, "InviteUserFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(
        path.join(__dirname, "functions/user-management/invite-user")
      ),
      handler: "index.handler",
      environment: {
        USER_POOL_ID: props.authentication.userPool.userPoolId,
      },
      timeout: cdk.Duration.seconds(30),
    });

    props.authentication.userPool.grant(
      inviteUserFunction,
      "cognito-idp:AdminCreateUser"
    );

    const inviteUserIntegration = new HttpLambdaIntegration(
      "InviteUserIntegration",
      inviteUserFunction
    );
    restBackend.restAPI.addRoutes({
      path: "/user-management/invite-user",
      methods: [apigwv2.HttpMethod.POST],
      integration: inviteUserIntegration,
      authorizer: httpAuthorizer,
    });

    new cdk.CfnOutput(this, "WS-API - apiEndpoint", {
      value: websocketBackend.wsAPI.apiEndpoint || "",
    });
    new cdk.CfnOutput(this, "HTTP-API - apiEndpoint", {
      value: restBackend.restAPI.apiEndpoint || "",
    });
  }
}
