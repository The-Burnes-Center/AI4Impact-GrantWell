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
import { aws_opensearchserverless as opensearchserverless } from "aws-cdk-lib";
import { knowledgeBaseIndexName } from "../../constants";

interface LambdaFunctionStackProps {
  readonly wsApiEndpoint: string;
  readonly sessionTable: Table;
  readonly feedbackTable: Table;
  readonly draftTable: Table;
  readonly nofoMetadataTable: Table;
  readonly searchJobsTable: Table;
  readonly draftGenerationJobsTable: Table;
  readonly feedbackBucket: s3.Bucket;
  readonly ffioNofosBucket: s3.Bucket;
  readonly userDocumentsBucket: s3.Bucket;
  readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  readonly knowledgeBaseSource: bedrock.CfnDataSource;
  readonly userDocumentsDataSource?: bedrock.CfnDataSource;
  readonly grantsGovApiKey: string;
  readonly openSearchCollection: opensearchserverless.CfnCollection;
}

export class LambdaFunctionStack extends cdk.Stack {
  public readonly chatFunction: lambda.Function;
  public readonly sessionFunction: lambda.Function;
  public readonly feedbackFunction: lambda.Function;
  public readonly deleteS3Function: lambda.Function;
  public readonly getS3Function: lambda.Function;
  public readonly uploadS3Function: lambda.Function;
  public readonly downloadS3Function: lambda.Function;
  public readonly uploadNOFOS3Function: lambda.Function;
  public readonly syncKBFunction: lambda.Function;
  public readonly createMetadataFunction: lambda.Function;
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
  public readonly applicationPdfGeneratorFunction: lambda.Function;
  public readonly syncNofoMetadataFunction: lambda.Function;
  public readonly autoArchiveExpiredNofosFunction: lambda.Function;
  public readonly aiGrantSearchFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaFunctionStackProps) {
    super(scope, id);

    // Create Python shared models Lambda Layer
    const pythonSharedLayer = new lambda.LayerVersion(scope, "PythonSharedLayer", {
      layerVersionName: `${stackName}-python-shared-layer`,
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
      code: lambda.Code.fromAsset(
        path.join(__dirname, "layers/python-shared-layer"), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t python && cp -au python /asset-output',
          ],
        },
      }
      ),
      description: "Shared Pydantic models and utilities for Python Lambda functions",
    });

    // Add draft editor Lambda function
    const draftAPIHandlerFunction = new lambda.Function(
      scope,
      "DraftHandlerFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromAsset(path.join(__dirname, "draft-editor")),
        handler: "lambda_function.lambda_handler",
        layers: [pythonSharedLayer],
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
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromAsset(path.join(__dirname, "session-handler")),
        handler: "lambda_function.lambda_handler",
        layers: [pythonSharedLayer],
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
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          SEARCH_JOBS_TABLE_NAME: props.searchJobsTable.tableName,
          ENABLE_DYNAMODB_CACHE: "true",
        },
        timeout: cdk.Duration.minutes(5),
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

    // DynamoDB permissions for grant recommendation function (for auto-detection, metadata checks, and search jobs)
    grantRecommendationFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:GetItem",
          "dynamodb:Scan",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
        ],
        resources: [
          props.nofoMetadataTable.tableArn,
          `${props.nofoMetadataTable.tableArn}/index/*`,
          props.searchJobsTable.tableArn,
        ],
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
          USER_DOCUMENTS_BUCKET: props.userDocumentsBucket.bucketName,
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
        actions: ["s3:ListBucket"],
        resources: [props.userDocumentsBucket.bucketArn],
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
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromAsset(path.join(__dirname, "feedback-handler")),
        handler: "lambda_function.lambda_handler",
        layers: [pythonSharedLayer],
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
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "knowledge-management/kb-sync")
        ),
        handler: "lambda_function.lambda_handler",
        layers: [pythonSharedLayer],
        environment: {
          KB_ID: props.knowledgeBase.attrKnowledgeBaseId,
          SOURCE: props.knowledgeBaseSource.attrDataSourceId,
          USER_DOCUMENTS_SOURCE: props.userDocumentsDataSource?.attrDataSourceId || "",
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    kbSyncAPIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:StartIngestionJob", "bedrock:ListIngestionJobs", "bedrock:GetIngestionJob"],
        resources: [props.knowledgeBase.attrKnowledgeBaseArn],
      })
    );
    this.syncKBFunction = kbSyncAPIHandlerFunction;

    // Lambda function to create metadata files for uploaded documents
    const createMetadataFunction = new lambda.Function(
      scope,
      "CreateMetadataFunction",
      {
        functionName: `${stackName}-createMetadataFunction`,
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "knowledge-management/create-metadata")
        ),
        handler: "index.handler",
        environment: {
          USER_DOCUMENTS_BUCKET: props.userDocumentsBucket.bucketName,
          NOFO_BUCKET: props.ffioNofosBucket.bucketName,
          SYNC_KB_FUNCTION_NAME: `${stackName}-syncKBFunction`,
          KB_ID: props.knowledgeBase.attrKnowledgeBaseId,
          SOURCE: props.knowledgeBaseSource.attrDataSourceId,
          USER_DOCUMENTS_SOURCE: props.userDocumentsDataSource?.attrDataSourceId || "",
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    createMetadataFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject", "s3:PutObject"],
        resources: [
          props.userDocumentsBucket.bucketArn + "/*",
          props.ffioNofosBucket.bucketArn + "/*",
        ],
      })
    );

    // Grant s3:ListBucket so GetObject returns NoSuchKey (not AccessDenied) for missing keys
    createMetadataFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:ListBucket"],
        resources: [
          props.userDocumentsBucket.bucketArn,
          props.ffioNofosBucket.bucketArn,
        ],
      })
    );

    // Grant permission to invoke KB sync function
    createMetadataFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["lambda:InvokeFunction"],
        resources: [kbSyncAPIHandlerFunction.functionArn],
      })
    );

    // Grant Bedrock permissions for checking sync status before triggering
    createMetadataFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:ListIngestionJobs"],
        resources: [props.knowledgeBase.attrKnowledgeBaseArn],
      })
    );

    // Add S3 event trigger for user documents bucket
    // Lambda will filter out metadata files and system files
    // Note: The bucket policy in buckets.ts grants s3:PutBucketNotification permission
    // to Lambda functions in the same account to allow CDK custom resource handler
    // to configure bucket notifications
    props.userDocumentsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(createMetadataFunction)
    );

    // Removed to avoid overlapping notification rules with SQS and other Lambda notifications
    // props.ffioNofosBucket.addEventNotification(
    //   s3.EventType.OBJECT_CREATED,
    //   new s3n.LambdaDestination(createMetadataFunction)
    // );

    this.createMetadataFunction = createMetadataFunction;

    const deleteS3APIHandlerFunction = new lambda.Function(
      scope,
      "DeleteS3FilesHandlerFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "knowledge-management/delete-document")
        ),
        handler: "lambda_function.lambda_handler",
        layers: [pythonSharedLayer],
        environment: {
          USER_DOCUMENTS_BUCKET: props.userDocumentsBucket.bucketName,
          SYNC_KB_FUNCTION_NAME: `${stackName}-syncKBFunction`,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    deleteS3APIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:DeleteObject", "s3:GetObject"],
        resources: [
          props.userDocumentsBucket.bucketArn + "/*",
        ],
      })
    );

    // Grant permission to invoke KB sync function
    deleteS3APIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["lambda:InvokeFunction"],
        resources: [kbSyncAPIHandlerFunction.functionArn],
      })
    );

    this.deleteS3Function = deleteS3APIHandlerFunction;

    const getS3APIHandlerFunction = new lambda.Function(
      scope,
      "GetS3FilesHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "knowledge-management")
        ),
        handler: "list-documents/index.handler",
        environment: {
          USER_DOCUMENTS_BUCKET: props.userDocumentsBucket.bucketName,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    getS3APIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:ListBucket"],
        resources: [
          props.userDocumentsBucket.bucketArn,
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
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          ENABLE_DYNAMODB_CACHE: "true",
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

    // Grant DynamoDB read permissions
    getS3APIHandlerFunctionForNOFOs.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan",
        ],
        resources: [
          props.nofoMetadataTable.tableArn,
          props.nofoMetadataTable.tableArn + "/index/*",
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
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          ENABLE_DYNAMODB_CACHE: "true",
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

    // Grant DynamoDB write permissions
    processNOFOAPIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:GetItem",
        ],
        resources: [
          props.nofoMetadataTable.tableArn,
          props.nofoMetadataTable.tableArn + "/index/*",
        ],
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
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          ENABLE_DYNAMODB_CACHE: "true",
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

    // Grant DynamoDB write permissions
    nofoStatusHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
        ],
        resources: [
          props.nofoMetadataTable.tableArn,
          props.nofoMetadataTable.tableArn + "/index/*",
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
          SYNC_KB_FUNCTION_NAME: `${stackName}-syncKBFunction`,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          ENABLE_DYNAMODB_CACHE: "true",
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

    // Grant DynamoDB delete permissions
    nofoDeleteHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:DeleteItem",
        ],
        resources: [
          props.nofoMetadataTable.tableArn,
        ],
      })
    );

    // Grant permission to invoke KB sync function
    nofoDeleteHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["lambda:InvokeFunction"],
        resources: [kbSyncAPIHandlerFunction.functionArn],
      })
    );

    this.nofoDeleteFunction = nofoDeleteHandlerFunction;

    const uploadS3APIHandlerFunction = new lambda.Function(
      scope,
      "UploadS3FilesHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "knowledge-management")
        ),
        handler: "generate-upload-url/index.handler",
        environment: {
          USER_DOCUMENTS_BUCKET: props.userDocumentsBucket.bucketName,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    uploadS3APIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:PutObject"],
        resources: [
          props.userDocumentsBucket.bucketArn + "/*",
        ],
      })
    );
    this.uploadS3Function = uploadS3APIHandlerFunction;

    const downloadS3APIHandlerFunction = new lambda.Function(
      scope,
      "DownloadS3FilesHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "knowledge-management")
        ),
        handler: "generate-download-url/index.handler",
        environment: {
          USER_DOCUMENTS_BUCKET: props.userDocumentsBucket.bucketName,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    downloadS3APIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject"],
        resources: [
          props.userDocumentsBucket.bucketArn + "/*",
        ],
      })
    );
    this.downloadS3Function = downloadS3APIHandlerFunction;

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
          DRAFT_GENERATION_JOBS_TABLE_NAME: props.draftGenerationJobsTable.tableName,
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

    // DynamoDB permissions for draft generator
    draftGeneratorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:GetItem",
        ],
        resources: [props.draftGenerationJobsTable.tableArn],
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
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          ENABLE_DYNAMODB_CACHE: "true",
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

    // Grant DynamoDB write permissions
    automatedNofoScraperFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:GetItem",
        ],
        resources: [
          props.nofoMetadataTable.tableArn,
          props.nofoMetadataTable.tableArn + "/index/*",
        ],
      })
    );

    // Create EventBridge rule to run the scraper daily at 9 AM UTC
    const environment = process.env.ENVIRONMENT;
    if (environment === 'production') {
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

      scraperRule.addTarget(new targets.LambdaFunction(automatedNofoScraperFunction));
    }

    this.automatedNofoScraperFunction = automatedNofoScraperFunction;

    // Add sync NOFO metadata Lambda function
    const syncNofoMetadataFunction = new lambda.Function(
      scope,
      "SyncNofoMetadataFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/sync-nofo-metadata")
        ),
        handler: "index.handler",
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
        },
        timeout: cdk.Duration.minutes(15),
      }
    );

    // S3 read permissions
    syncNofoMetadataFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject", "s3:ListBucket"],
        resources: [
          props.ffioNofosBucket.bucketArn,
          `${props.ffioNofosBucket.bucketArn}/*`,
        ],
      })
    );

    // DynamoDB write permissions
    syncNofoMetadataFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
        ],
        resources: [
          props.nofoMetadataTable.tableArn,
          props.nofoMetadataTable.tableArn + "/index/*",
        ],
      })
    );

    this.syncNofoMetadataFunction = syncNofoMetadataFunction;

    // Create Puppeteer Core Lambda Layer for HTML to PDF conversion
    // Note: @sparticuz/chromium v131+ bundles all required dependencies, so no separate Chromium layer is needed
    const puppeteerCoreLayer = new lambda.LayerVersion(scope, "PuppeteerCoreLayer", {
      layerVersionName: "PuppeteerCoreLayer",
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      code: lambda.Code.fromAsset(
        path.join(__dirname, "layers/puppeteer-core-layer.zip")
      ),
      description: "Puppeteer Core and dependencies for Lambda",
    });

    // Add HTML to PDF converter Lambda function
    const htmlToPdfConverterFunction = new lambda.Function(
      scope,
      "HtmlToPdfConverterFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/html-to-pdf-converter")),
        handler: "index.handler",
        layers: [puppeteerCoreLayer],
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
        },
        timeout: cdk.Duration.minutes(5),
        memorySize: 1024, // PDF conversion with Chromium can be memory-intensive
      }
    );

    // S3 permissions for HTML to PDF converter
    // ListBucket permission on the bucket itself
    htmlToPdfConverterFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:ListBucket"],
        resources: [props.ffioNofosBucket.bucketArn],
      })
    );
    // Object-level permissions on bucket contents
    htmlToPdfConverterFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
        resources: [`${props.ffioNofosBucket.bucketArn}/*`],
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

    // Application PDF Generator Lambda Function (using Puppeteer for tagged PDFs)
    const applicationPdfGeneratorFunction = new lambda.Function(
      scope,
      "ApplicationPdfGeneratorFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "application-pdf-generator")
        ),
        handler: "index.handler",
        layers: [puppeteerCoreLayer],
        timeout: cdk.Duration.minutes(5),
        memorySize: 2048, // PDF conversion with Chromium can be memory-intensive
      }
    );

    this.applicationPdfGeneratorFunction = applicationPdfGeneratorFunction;

    // Auto-Archive Expired NOFOs Lambda Function
    const autoArchiveExpiredNofosFunction = new lambda.Function(
      scope,
      'AutoArchiveExpiredNofosFunction',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, 'landing-page/auto-archive-expired-nofos')
        ),
        handler: 'index.handler',
        environment: {
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          BUCKET: props.ffioNofosBucket.bucketName,
          GRACE_PERIOD_DAYS: '1', // 1 day grace period (archive next day)
          DRY_RUN: 'false', // Set to 'true' for testing
        },
        timeout: cdk.Duration.minutes(15),
      }
    );

    // Grant DynamoDB permissions
    autoArchiveExpiredNofosFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:Query',
          'dynamodb:UpdateItem',
        ],
        resources: [
          props.nofoMetadataTable.tableArn,
          `${props.nofoMetadataTable.tableArn}/index/*`,
        ],
      })
    );

    // Grant S3 permissions
    autoArchiveExpiredNofosFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:GetObject',
          's3:PutObject',
        ],
        resources: [
          `${props.ffioNofosBucket.bucketArn}/*`,
        ],
      })
    );

    this.autoArchiveExpiredNofosFunction = autoArchiveExpiredNofosFunction;

    // Create EventBridge rule to run daily at 2 AM UTC
    const autoArchiveRule = new events.Rule(scope, 'AutoArchiveExpiredNofosRule', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '2',
        day: '*',
        month: '*',
        year: '*',
      }),
      description: 'Automatically archive expired NOFOs daily',
    });

    // Add the Lambda function as a target for the EventBridge rule
    autoArchiveRule.addTarget(new targets.LambdaFunction(autoArchiveExpiredNofosFunction));

    // Lambda invoke permission for async RAG search (self-invoke)
    const stack = cdk.Stack.of(this);
    this.grantRecommendationFunction.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'AllowSelfInvoke',
        effect: iam.Effect.ALLOW,
        actions: ["lambda:InvokeFunction"],
        resources: [
          `arn:aws:lambda:${stack.region}:${stack.account}:function:*`,
        ],
      })
    );

    // AI Grant Search Lambda (hybrid BM25 + semantic via OpenSearch Serverless)
    const aiGrantSearchFunction = new lambda.Function(
      scope,
      "AIGrantSearchFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/ai-grant-search")
        ),
        handler: "index.handler",
        environment: {
          OPENSEARCH_ENDPOINT: `${props.openSearchCollection.attrId}.${stack.region}.aoss.amazonaws.com`,
          OPENSEARCH_INDEX: knowledgeBaseIndexName,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
        },
        timeout: cdk.Duration.seconds(30),
        memorySize: 512,
      }
    );

    aiGrantSearchFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["aoss:APIAccessAll"],
        resources: [
          `arn:aws:aoss:${stack.region}:${stack.account}:collection/${props.openSearchCollection.attrId}`,
        ],
      })
    );

    aiGrantSearchFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${stack.region}::foundation-model/amazon.titan-embed-text-v2:0`,
        ],
      })
    );

    aiGrantSearchFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:Scan"],
        resources: [
          props.nofoMetadataTable.tableArn,
        ],
      })
    );

    this.aiGrantSearchFunction = aiGrantSearchFunction;
  }
}
