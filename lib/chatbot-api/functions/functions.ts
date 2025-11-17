/**
 * This file defines the LambdaFunctionStack class, which sets up various Lambda functions for the Gen AI MVP application using AWS CDK.
 * These Lambda functions handle session management, feedback processing, S3 operations, and knowledge base synchronization.
 */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";
import { stackName } from "../../constants";

// Import Lambda L2 construct
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as bedrock from "aws-cdk-lib/aws-bedrock";
import { S3EventSource, SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";

interface LambdaFunctionStackProps {
  readonly wsApiEndpoint: string;
  readonly sessionTable: Table;
  readonly feedbackTable: Table;
  readonly draftTable: Table;
  readonly feedbackBucket: s3.Bucket;
  readonly ffioNofosBucket: s3.Bucket;
  readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  readonly knowledgeBaseSource: bedrock.CfnDataSource;
  readonly grantsGovApiKey: string;
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
  public readonly getNOFOQuestions: lambda.Function;
  public readonly processAndSummarizeNOFO: lambda.Function;
  public readonly grantRecommendationFunction: lambda.Function;
  public readonly nofoStatusFunction: lambda.Function;
  public readonly nofoRenameFunction: lambda.Function;
  public readonly nofoDeleteFunction: lambda.Function;
  public readonly draftFunction: lambda.Function;
  public readonly draftGeneratorFunction: lambda.Function;
  public readonly automatedNofoScraperFunction: lambda.Function;
  public readonly htmlToPdfConverterFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaFunctionStackProps) {
    super(scope, id);

    // Add draft editor Lambda function
    const draftAPIHandlerFunction = new lambda.Function(
      scope,
      "DraftHandlerFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromAsset(path.join(__dirname, "draft-editor")),
        handler: "lambda_function.lambda_handler",
        environment: {
          DRAFT_TABLE_NAME: props.draftTable.tableName,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    draftAPIHandlerFunction.addToRolePolicy(
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
          props.draftTable.tableArn,
          props.draftTable.tableArn + "/index/*",
        ],
      })
    );

    this.draftFunction = draftAPIHandlerFunction;

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
          KB_ID: props.knowledgeBase.attrKnowledgeBaseId,
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
        actions: [
          "bedrock:InvokeModel",
          "bedrock:Retrieve",
          "bedrock-agent:Retrieve",
        ],
        resources: ["*"],
      })
    );

    this.grantRecommendationFunction = grantRecommendationFunction;

    // Update WebSocket chat function
    const websocketAPIFunction = new lambda.Function(
      scope,
      "ChatHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(path.join(__dirname, "websocket-chat")),
        handler: "index.handler",
        environment: {
          WEBSOCKET_API_ENDPOINT: props.wsApiEndpoint.replace("wss", "https"),
          KB_ID: props.knowledgeBase.attrKnowledgeBaseId,
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

    // Create Dead Letter Queue for NOFO processing
    const nofoProcessingDLQ = new sqs.Queue(scope, "NOFOProcessingDLQ", {
      retentionPeriod: cdk.Duration.days(14),
    });

    // Create SQS Queue for NOFO processing
    const nofoProcessingQueue = new sqs.Queue(scope, "NOFOProcessingQueue", {
      visibilityTimeout: cdk.Duration.minutes(15), // Matches Lambda timeout
      receiveMessageWaitTime: cdk.Duration.seconds(20), // Long polling
      deadLetterQueue: {
        queue: nofoProcessingDLQ,
        maxReceiveCount: 3, // Retry 3 times before DLQ
      },
    });

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
    //   resources: [props.ffioNofosBucket.bucketArn,props.ffioNofosBucket.bucketArn+"/*",'arn:aws:bedrock:us-east-1::foundation-model/us.anthropic.claude-sonnet-4-20250514-v1:0']
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

    // SQS permissions for Lambda
    processNOFOAPIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ],
        resources: [nofoProcessingQueue.queueArn],
      })
    );

    this.processAndSummarizeNOFO = processNOFOAPIHandlerFunction;
    
    // Remove S3EventSource and add SqsEventSource instead
    processNOFOAPIHandlerFunction.addEventSource(
      new SqsEventSource(nofoProcessingQueue, {
        batchSize: 1, // Process one file at a time
        maxConcurrency: 5, // Rate limiting: max 5 concurrent executions
        reportBatchItemFailures: true, // Enable partial batch failure handling
      })
    );

    // Add S3 → SQS notification
    props.ffioNofosBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(nofoProcessingQueue),
      {
        prefix: "",
        suffix: "NOFO-File-PDF",
      }
    );
    props.ffioNofosBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(nofoProcessingQueue),
      {
        prefix: "",
        suffix: "NOFO-File-TXT",
      }
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

    const NOFOQuestionsForNOFOs = new lambda.Function(
      scope,
      "GetQuestionsForNOFOs",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/retrieveNOFOQuestions")
        ),
        handler: "index.handler",
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
        },
        timeout: cdk.Duration.minutes(2),
      }
    );

    NOFOQuestionsForNOFOs.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:*", "bedrock:*"],
        resources: [
          props.ffioNofosBucket.bucketArn,
          props.ffioNofosBucket.bucketArn + "/*",
        ],
      })
    );
    this.getNOFOQuestions = NOFOQuestionsForNOFOs;

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

    // Add the NOFO status update function
    const nofoStatusHandlerFunction = new lambda.Function(
      scope,
      "NofoStatusHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/nofo-status")
        ),
        handler: "index.handler",
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    nofoStatusHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
        resources: [
          props.ffioNofosBucket.bucketArn,
          props.ffioNofosBucket.bucketArn + "/*",
        ],
      })
    );

    this.nofoStatusFunction = nofoStatusHandlerFunction;

    // Add the NOFO rename function
    const nofoRenameHandlerFunction = new lambda.Function(
      scope,
      "NofoRenameHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/nofo-rename")
        ),
        handler: "index.handler",
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
        },
        timeout: cdk.Duration.seconds(60),
      }
    );

    nofoRenameHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:CopyObject",
        ],
        resources: [
          props.ffioNofosBucket.bucketArn,
          props.ffioNofosBucket.bucketArn + "/*",
        ],
      })
    );

    this.nofoRenameFunction = nofoRenameHandlerFunction;

    // Add the NOFO delete function
    const nofoDeleteHandlerFunction = new lambda.Function(
      scope,
      "NofoDeleteHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/nofo-delete")
        ),
        handler: "index.handler",
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
        },
        timeout: cdk.Duration.seconds(60),
      }
    );

    nofoDeleteHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
        resources: [
          props.ffioNofosBucket.bucketArn,
          props.ffioNofosBucket.bucketArn + "/*",
        ],
      })
    );

    this.nofoDeleteFunction = nofoDeleteHandlerFunction;

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

    // Add draft generator function
    const draftGeneratorFunction = new lambda.Function(
      scope,
      "DraftGeneratorFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/draft-generator")
        ),
        handler: "index.handler",
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
          KB_ID: props.knowledgeBase.attrKnowledgeBaseId,
        },
        timeout: cdk.Duration.minutes(2),
      }
    );

    // S3 permissions for draft generator
    draftGeneratorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject", "s3:ListBucket"],
        resources: [
          props.ffioNofosBucket.bucketArn,
          `${props.ffioNofosBucket.bucketArn}/*`,
        ],
      })
    );

    // Bedrock permissions for draft generator
    draftGeneratorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock:InvokeModel",
          "bedrock:Retrieve",
          "bedrock-agent:Retrieve",
        ],
        resources: ["*"],
      })
    );

    this.draftGeneratorFunction = draftGeneratorFunction;

    // Add automated NOFO scraper function
    const automatedNofoScraperFunction = new lambda.Function(
      scope,
      "AutomatedNofoScraperFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/automated-nofo-scraper")
        ),
        handler: "index.handler",
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
          GRANTS_GOV_API_KEY: props.grantsGovApiKey,
        },
        timeout: cdk.Duration.minutes(15),
      }
    );

    // S3 permissions for automated NOFO scraper
    automatedNofoScraperFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
        resources: [
          props.ffioNofosBucket.bucketArn,
          `${props.ffioNofosBucket.bucketArn}/*`,
        ],
      })
    );

    // Bedrock permissions for automated NOFO scraper (to identify NOFO file from multiple attachments)
    automatedNofoScraperFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );

    // Create EventBridge rule to run the scraper daily at 9 AM UTC
    const scraperRule = new events.Rule(scope, 'AutomatedNofoScraperRule', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '9',
        day: '*',
        month: '*',
        year: '*',
      }),
      description: 'Trigger automated NOFO scraper daily at 9 AM UTC',
    });

    // Add the Lambda function as a target for the EventBridge rule
    scraperRule.addTarget(new targets.LambdaFunction(automatedNofoScraperFunction));

    this.automatedNofoScraperFunction = automatedNofoScraperFunction;

    // Add HTML to PDF converter Lambda function
    const htmlToPdfConverterFunction = new lambda.Function(
      scope,
      "HtmlToPdfConverterFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/html-to-pdf-converter")),
        handler: "index.handler",
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
        },
        timeout: cdk.Duration.minutes(5),
        memorySize: 1024, // PDF conversion with Chromium can be memory-intensive
      }
    );

    // S3 permissions for HTML to PDF converter
    htmlToPdfConverterFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
        resources: [
          props.ffioNofosBucket.bucketArn,
          `${props.ffioNofosBucket.bucketArn}/*`,
        ],
      })
    );

    // Add S3 event notification to trigger HTML-to-PDF conversion
    props.ffioNofosBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(htmlToPdfConverterFunction),
      {
        prefix: "pending-conversion/",
        suffix: ".html",
      }
    );

    this.htmlToPdfConverterFunction = htmlToPdfConverterFunction;
  }
}
