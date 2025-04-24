/**
 * This file defines the LambdaFunctionStack class, which sets up various Lambda functions for the Gen AI MVP application using AWS CDK.
 * These Lambda functions handle session management, feedback processing, S3 operations, and knowledge base synchronization.
 */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";
import { stackName } from "../../constants";
import { PROMPT_TEXT } from "./prompt";

// Import Lambda L2 construct
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as bedrock from "aws-cdk-lib/aws-bedrock";
import { S3EventSource } from "aws-cdk-lib/aws-lambda-event-sources";

interface LambdaFunctionStackProps {
  readonly wsApiEndpoint: string;
  readonly sessionTable: Table;
  readonly feedbackTable: Table;
  readonly feedbackBucket: s3.Bucket;
  readonly ffioNofosBucket: s3.Bucket;
  readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  readonly knowledgeBaseSource: bedrock.CfnDataSource;
}

export class LambdaFunctionStack extends cdk.Stack {
  public readonly chatFunction: lambda.Function;
  public readonly sessionFunction: lambda.Function;
  public readonly feedbackFunction: lambda.Function;
  public readonly deleteS3Function: lambda.Function;
  public readonly getS3Function: lambda.Function;
  public readonly uploadS3Function: lambda.Function;
  public readonly uploadNOFOS3Function: lambda.Function;
  public readonly syncKBFunction: lambda.Function;
  public readonly getNOFOsList: lambda.Function;
  public readonly getNOFOSummary: lambda.Function;
  public readonly processAndSummarizeNOFO: lambda.Function;
  public readonly grantRecommendationFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaFunctionStackProps) {
    super(scope, id);

    const sessionAPIHandlerFunction = new lambda.Function(
      scope,
      "SessionHandlerFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
        code: lambda.Code.fromAsset(path.join(__dirname, "session-handler")), // Points to the lambda directory
        handler: "lambda_function.lambda_handler", // Points to the 'hello' file in the lambda directory
        environment: {
          DDB_TABLE_NAME: props.sessionTable.tableName,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    sessionAPIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
        ],
        resources: [
          props.sessionTable.tableArn,
          props.sessionTable.tableArn + "/index/*",
        ],
      })
    );

    this.sessionFunction = sessionAPIHandlerFunction;

    // Grant Recommendation Lambda function
    const grantRecommendationFunction = new lambda.Function(
      scope,
      "GrantRecommendationFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/grant-recommendation")
        ),
        handler: "index.handler",
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
        },
        timeout: cdk.Duration.minutes(2),
      }
    );

    // S3 permissions for grant recommendation function
    grantRecommendationFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject", "s3:ListBucket"],
        resources: [
          props.ffioNofosBucket.bucketArn,
          `${props.ffioNofosBucket.bucketArn}/*`,
        ],
      })
    );

    // Bedrock permissions for grant recommendation function
    grantRecommendationFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );

    this.grantRecommendationFunction = grantRecommendationFunction;

    // Update WebSocket chat function to include the grant recommendation function name
    const websocketAPIFunction = new lambda.Function(
      scope,
      "ChatHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(path.join(__dirname, "websocket-chat")),
        handler: "index.handler",
        environment: {
          WEBSOCKET_API_ENDPOINT: props.wsApiEndpoint.replace("wss", "https"),
          PROMPT: PROMPT_TEXT,
          KB_ID: props.knowledgeBase.attrKnowledgeBaseId,
          GRANT_RECOMMENDATION_FUNCTION: this.grantRecommendationFunction.functionName,
          SESSION_HANDLER: this.sessionFunction.functionName,
        },
        timeout: cdk.Duration.seconds(300),
      }
    );

    websocketAPIFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:InvokeModel",
        ],
        resources: ["*"],
      })
    );

    websocketAPIFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:Retrieve"],
        resources: [props.knowledgeBase.attrKnowledgeBaseArn],
      })
    );

    websocketAPIFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["lambda:InvokeFunction"],
        resources: [
          this.sessionFunction.functionArn,
          this.grantRecommendationFunction.functionArn,
        ],
      })
    );

    this.chatFunction = websocketAPIFunction;

    const feedbackAPIHandlerFunction = new lambda.Function(
      scope,
      "FeedbackHandlerFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
        code: lambda.Code.fromAsset(path.join(__dirname, "feedback-handler")), // Points to the lambda directory
        handler: "lambda_function.lambda_handler", // Points to the 'hello' file in the lambda directory
        environment: {
          FEEDBACK_TABLE: props.feedbackTable.tableName,
          FEEDBACK_S3_DOWNLOAD: props.feedbackBucket.bucketName,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    feedbackAPIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
        ],
        resources: [
          props.feedbackTable.tableArn,
          props.feedbackTable.tableArn + "/index/*",
        ],
      })
    );

    feedbackAPIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:*"],
        resources: [
          props.feedbackBucket.bucketArn,
          props.feedbackBucket.bucketArn + "/*",
        ],
      })
    );

    this.feedbackFunction = feedbackAPIHandlerFunction;

    const kbSyncAPIHandlerFunction = new lambda.Function(
      scope,
      "SyncKBHandlerFunction",
      {
        functionName: `${stackName}-syncKBFunction`,
        runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
        code: lambda.Code.fromAsset(
          path.join(__dirname, "knowledge-management/kb-sync")
        ), // Points to the lambda directory
        handler: "lambda_function.lambda_handler", // Points to the 'hello' file in the lambda directory
        environment: {
          KB_ID: props.knowledgeBase.attrKnowledgeBaseId,
          SOURCE: props.knowledgeBaseSource.attrDataSourceId,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    kbSyncAPIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:*"],
        resources: [props.knowledgeBase.attrKnowledgeBaseArn],
      })
    );
    this.syncKBFunction = kbSyncAPIHandlerFunction;

    const deleteS3APIHandlerFunction = new lambda.Function(
      scope,
      "DeleteS3FilesHandlerFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_12, // Choose any supported Node.js runtime
        code: lambda.Code.fromAsset(
          path.join(__dirname, "knowledge-management/delete-s3")
        ), // Points to the lambda directory
        handler: "lambda_function.lambda_handler", // Points to the 'hello' file in the lambda directory
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    deleteS3APIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:*"],
        resources: [
          props.ffioNofosBucket.bucketArn,
          props.ffioNofosBucket.bucketArn + "/*",
        ],
      })
    );
    this.deleteS3Function = deleteS3APIHandlerFunction;

    const getS3APIHandlerFunction = new lambda.Function(
      scope,
      "GetS3FilesHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
        code: lambda.Code.fromAsset(
          path.join(__dirname, "knowledge-management/get-s3")
        ), // Points to the lambda directory
        handler: "index.handler", // Points to the 'hello' file in the lambda directory
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    getS3APIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:*"],
        resources: [
          props.ffioNofosBucket.bucketArn,
          props.ffioNofosBucket.bucketArn + "/*",
        ],
      })
    );
    this.getS3Function = getS3APIHandlerFunction;

    const getS3APIHandlerFunctionForNOFOs = new lambda.Function(
      scope,
      "GetS3APIHandlerFunctionForNOFOs",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/retrieve-nofos")
        ),
        handler: "index.handler",
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
        },
        timeout: cdk.Duration.minutes(3),
      }
    );

    getS3APIHandlerFunctionForNOFOs.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:*",
          //'s3:GetObject',     // Read objects from the bucket
          //'s3:ListBucket'     // List the contents of the bucket
        ],
        resources: [
          props.ffioNofosBucket.bucketArn,
          props.ffioNofosBucket.bucketArn + "/*",
        ],
      })
    );
    this.getNOFOsList = getS3APIHandlerFunctionForNOFOs;

    const processNOFOAPIHandlerFunction = new lambda.Function(
      scope,
      "ProcessNOFOAPIHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/processAndSummarizeNOFO")
        ),
        handler: "index.handler",
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
          SYNC_KB_FUNCTION_NAME: `${stackName}-syncKBFunction`,
        },
        timeout: cdk.Duration.minutes(9),
      }
    );
    // processNOFOAPIHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
    //   effect: iam.Effect.ALLOW,
    //   actions: [
    //     's3:*',
    //     'bedrock:*',
    //     'textract:*'
    //   ],
    //   resources: [props.ffioNofosBucket.bucketArn,props.ffioNofosBucket.bucketArn+"/*",'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0']
    // }));
    // S3 permissions
    processNOFOAPIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
        resources: [
          props.ffioNofosBucket.bucketArn,
          `${props.ffioNofosBucket.bucketArn}/*`,
        ],
      })
    );

    // Textract permissions
    processNOFOAPIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "textract:StartDocumentTextDetection",
          "textract:GetDocumentTextDetection",
        ],
        resources: ["*"],
      })
    );

    // Bedrock permissions
    processNOFOAPIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );

    processNOFOAPIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["lambda:InvokeFunction"],
        resources: [this.syncKBFunction.functionArn],
      })
    );

    this.processAndSummarizeNOFO = processNOFOAPIHandlerFunction;
    processNOFOAPIHandlerFunction.addEventSource(
      new S3EventSource(props.ffioNofosBucket, {
        events: [s3.EventType.OBJECT_CREATED],
      })
    );

    const RequirementsForNOFOs = new lambda.Function(
      scope,
      "GetRequirementsForNOFOs",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/retrieveNOFOSummary")
        ),
        handler: "index.handler",
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
        },
        timeout: cdk.Duration.minutes(2),
      }
    );

    RequirementsForNOFOs.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:*", "bedrock:*"],
        resources: [
          props.ffioNofosBucket.bucketArn,
          props.ffioNofosBucket.bucketArn + "/*",
        ],
      })
    );
    this.getNOFOSummary = RequirementsForNOFOs;

    // NOFO UPLOAD ATTEMPT
    const nofoUploadS3APIHandlerFunction = new lambda.Function(
      scope,
      "nofoUploadS3FilesHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/upload-nofos")
        ), // Points to the lambda directory
        handler: "index.handler", // Points to the 'hello' file in the lambda directory
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
        },
        timeout: cdk.Duration.seconds(60),
      }
    );
    nofoUploadS3APIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:*"],
        resources: [
          props.ffioNofosBucket.bucketArn,
          props.ffioNofosBucket.bucketArn + "/*",
        ],
      })
    );
    this.uploadNOFOS3Function = nofoUploadS3APIHandlerFunction;
    // end

    const uploadS3APIHandlerFunction = new lambda.Function(
      scope,
      "UploadS3FilesHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
        code: lambda.Code.fromAsset(
          path.join(__dirname, "knowledge-management/upload-s3")
        ), // Points to the lambda directory
        handler: "index.handler", // Points to the 'hello' file in the lambda directory
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    uploadS3APIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:*"],
        resources: [
          props.ffioNofosBucket.bucketArn,
          props.ffioNofosBucket.bucketArn + "/*",
        ],
      })
    );
    this.uploadS3Function = uploadS3APIHandlerFunction;
  }
}