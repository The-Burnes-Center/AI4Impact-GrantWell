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
import { StackProps } from "aws-cdk-lib";

interface LambdaFunctionStackProps extends StackProps {
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

  constructor(scope: Construct, id: string, props: LambdaFunctionStackProps) {
    super(scope, id, props);

    // Define the session handler Lambda function
    const sessionAPIHandlerFunction = new lambda.Function(
      this,
      "SessionHandlerFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromAsset(path.join(__dirname, "session-handler")),
        handler: "lambda_function.lambda_handler",
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
          `${props.sessionTable.tableArn}/index/*`,
        ],
      })
    );

    this.sessionFunction = sessionAPIHandlerFunction;

    // Define the chat handler Lambda function
    const websocketAPIFunction = new lambda.Function(
      this,
      "ChatHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(path.join(__dirname, "websocket-chat")),
        handler: "index.handler",
        environment: {
          WEBSOCKET_API_ENDPOINT: props.wsApiEndpoint.replace("wss", "https"),
          PROMPT: PROMPT_TEXT,
          KB_ID: props.knowledgeBase.attrKnowledgeBaseId,
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
        resources: [this.sessionFunction.functionArn],
      })
    );

    this.chatFunction = websocketAPIFunction;

    // Define the feedback handler Lambda function
    const feedbackAPIHandlerFunction = new lambda.Function(
      this,
      "FeedbackHandlerFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromAsset(path.join(__dirname, "feedback-handler")),
        handler: "lambda_function.lambda_handler",
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
          `${props.feedbackTable.tableArn}/index/*`,
        ],
      })
    );

    feedbackAPIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:*"],
        resources: [
          props.feedbackBucket.bucketArn,
          `${props.feedbackBucket.bucketArn}/*`,
        ],
      })
    );

    this.feedbackFunction = feedbackAPIHandlerFunction;

    // Define the knowledge base sync handler Lambda function
    const kbSyncAPIHandlerFunction = new lambda.Function(
      this,
      "SyncKBHandlerFunction",
      {
        functionName: `${stackName}-syncKBFunction`,
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "knowledge-management/kb-sync")
        ),
        handler: "lambda_function.lambda_handler",
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

    // Define the delete S3 files handler Lambda function
    const deleteS3APIHandlerFunction = new lambda.Function(
      this,
      "DeleteS3FilesHandlerFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "knowledge-management/delete-s3")
        ),
        handler: "lambda_function.lambda_handler",
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
          `${props.ffioNofosBucket.bucketArn}/*`,
        ],
      })
    );

    this.deleteS3Function = deleteS3APIHandlerFunction;

    // Define the get S3 files handler Lambda function
    const getS3APIHandlerFunction = new lambda.Function(
      this,
      "GetS3FilesHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "knowledge-management/get-s3")
        ),
        handler: "index.handler",
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
          `${props.ffioNofosBucket.bucketArn}/*`,
        ],
      })
    );

    this.getS3Function = getS3APIHandlerFunction;

    // Define the get NOFOs list handler Lambda function
    const getS3APIHandlerFunctionForNOFOs = new lambda.Function(
      this,
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
        actions: ["s3:*"],
        resources: [
          props.ffioNofosBucket.bucketArn,
          `${props.ffioNofosBucket.bucketArn}/*`,
        ],
      })
    );

    this.getNOFOsList = getS3APIHandlerFunctionForNOFOs;

    // Define the process and summarize NOFO handler Lambda function
    const processNOFOAPIHandlerFunction = new lambda.Function(
      this,
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

    // Define the get NOFO summary handler Lambda function
    const RequirementsForNOFOs = new lambda.Function(
      this,
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
          `${props.ffioNofosBucket.bucketArn}/*`,
        ],
      })
    );

    this.getNOFOSummary = RequirementsForNOFOs;

    // Define the NOFO upload handler Lambda function
    const nofoUploadS3APIHandlerFunction = new lambda.Function(
      this,
      "nofoUploadS3FilesHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/upload-nofos")
        ),
        handler: "index.handler",
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
          `${props.ffioNofosBucket.bucketArn}/*`,
        ],
      })
    );

    this.uploadNOFOS3Function = nofoUploadS3APIHandlerFunction;

    // Define the general S3 upload handler Lambda function
    const uploadS3APIHandlerFunction = new lambda.Function(
      this,
      "UploadS3FilesHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "knowledge-management/upload-s3")
        ),
        handler: "index.handler",
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
          `${props.ffioNofosBucket.bucketArn}/*`,
        ],
      })
    );

    this.uploadS3Function = uploadS3APIHandlerFunction;
  }
}