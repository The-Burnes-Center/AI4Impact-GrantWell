/**
 * This file defines the LambdaFunctionStack class, which sets up various Lambda functions for the GrantWell application using AWS CDK.
 * These Lambda functions handle session management, S3 operations, and knowledge base synchronization.
 */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";
import { stackName, emailConfig } from "../../constants";
import { genericBrandingData } from "../../shared/generic-branding";

// Import Lambda L2 construct
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ses from "aws-cdk-lib/aws-ses";
import * as sns from "aws-cdk-lib/aws-sns";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as bedrock from "aws-cdk-lib/aws-bedrock";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import { aws_opensearchserverless as opensearchserverless } from "aws-cdk-lib";
import { knowledgeBaseIndexName } from "../../constants";
import { SUPPORTED_STATES } from "../../shared/states";
import { DocumentConversionStack } from "./document-conversion-stack";
import { NotificationsStack } from "./notifications-stack";
import { ScraperStack } from "./scraper-stack";
import { NofoPipelineStack } from "./nofo-pipeline-stack";
import { DraftGenerationStack } from "./draft-generation-stack";
import {
  lambdaInvokePolicy,
  metadataTableReadWritePolicy,
  reviewTableReadWritePolicy,
  s3ReadWritePolicy,
} from "./shared-policies";

// [{code,name}] so handlers get both membership checks and display names from one env var.
const SUPPORTED_STATES_ENV = JSON.stringify(
  SUPPORTED_STATES.map((s) => ({ code: s.code, name: s.name }))
);

// Platform authority is the explicit PlatformAdmin role. While this is "true", a legacy
// stateless Admin still resolves to platform-wide — the pre-migration form. Flip to "false"
// only after every stateless admin in the pool has been migrated to PlatformAdmin, or they
// lose cross-state access. See scripts/migrate-platform-admins.mjs.
const LEGACY_STATELESS_ADMIN_IS_PLATFORM = "true";

interface LambdaFunctionStackProps {
  readonly wsApiEndpoint: string;
  readonly sessionTable: Table;
  readonly draftTable: Table;
  readonly draftVersionTable: Table;
  readonly nofoMetadataTable: Table;
  readonly nofoProcessingReviewTable: Table;
  readonly draftGenerationJobsTable: Table;
  readonly featureRolloutTable: Table;
  readonly userNotificationPrefsTable: Table;
  readonly digestSendLogTable: Table;
  readonly digestSuppressionTable: Table;
  readonly nofoStateOverlayTable: Table;
  readonly analyticsTable: Table;
  readonly ffioNofosBucket: s3.Bucket;
  readonly userDocumentsBucket: s3.Bucket;
  readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  readonly knowledgeBaseSource: bedrock.CfnDataSource;
  readonly userDocumentsDataSource?: bedrock.CfnDataSource;
  readonly grantsGovApiKey: string;
  readonly openSearchCollection: opensearchserverless.CfnCollection;
  readonly userPool: cdk.aws_cognito.UserPool;
}

export class LambdaFunctionStack extends cdk.Stack {
  public readonly chatFunction: lambda.Function;
  public readonly sessionFunction: lambda.Function;
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
  public readonly nofoProcessingStateMachine: sfn.StateMachine;
  public readonly nofoAdminFunction: lambda.Function;
  public readonly nofoReprocessFunction: lambda.Function;
  public readonly nofoStatusFunction: lambda.Function;
  public readonly nofoRenameFunction: lambda.Function;
  public readonly nofoDeleteFunction: lambda.Function;
  public readonly draftFunction: lambda.Function;
  public readonly draftVersionWriterFunction: lambda.Function;
  public readonly draftGenerationStateMachine: sfn.StateMachine;
  public readonly scraperCoordinatorFunction: lambda.Function;
  public readonly opportunityProcessorFunction: lambda.Function;
  public readonly htmlToPdfConverterFunction: lambda.Function;
  public readonly applicationPdfGeneratorFunction: lambda.Function;
  public readonly docxToTextConverterFunction: lambda.Function;
  public readonly applicationDocxGeneratorFunction: lambda.Function;
  public readonly syncNofoMetadataFunction: lambda.Function;
  public readonly autoArchiveExpiredNofosFunction: lambda.Function;
  public readonly notificationDigestFunction: lambda.Function;
  public readonly notificationDigestPreviewFunction: lambda.Function;
  public readonly notificationDigestBroadcastFunction: lambda.Function;
  public readonly notificationUnsubscribeFunction: lambda.Function;
  public readonly notificationSesFeedbackFunction: lambda.Function;
  public readonly aiGrantSearchFunction: lambda.Function;
  public readonly feedbackProxyFunction: lambda.Function;
  public readonly nofoSummaryUpdateFunction: lambda.Function;
  public readonly nofoStateOverlayFunction: lambda.Function;
  public readonly nofoPromoteCopyFunction: lambda.Function;
  public readonly userProfileFunction: lambda.Function;
  public readonly analyticsFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaFunctionStackProps) {
    super(scope, id);

    // Centralized Bedrock model IDs — update here to change everywhere
    const SONNET_MODEL_ID = "global.anthropic.claude-sonnet-4-6";
    const HAIKU_MODEL_ID = "global.anthropic.claude-haiku-4-5-20251001-v1:0";
    const TITAN_MODEL_ID = "amazon.titan-embed-text-v2:0";

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    const makeInferenceProfile = (
      id: string,
      name: string,
      copyFrom: string,
      component: string,
    ) =>
      new bedrock.CfnApplicationInferenceProfile(scope, id, {
        inferenceProfileName: `${stackName}-${name}`,
        modelSource: { copyFrom },
        tags: [{ key: "Component", value: component }],
      });

    const sonnetSystemProfileArn = `arn:aws:bedrock:${region}:${account}:inference-profile/${SONNET_MODEL_ID}`;
    const haikuSystemProfileArn = `arn:aws:bedrock:${region}:${account}:inference-profile/${HAIKU_MODEL_ID}`;
    const titanFoundationModelArn = `arn:aws:bedrock:${region}::foundation-model/${TITAN_MODEL_ID}`;

    const sonnetChatProfile = makeInferenceProfile(
      "SonnetChatInferenceProfile", "sonnet-chat", sonnetSystemProfileArn, "chat",
    );
    const sonnetNofoProfile = makeInferenceProfile(
      "SonnetNofoInferenceProfile", "sonnet-nofo-pipeline", sonnetSystemProfileArn, "nofo-pipeline",
    );
    const sonnetDraftProfile = makeInferenceProfile(
      "SonnetDraftInferenceProfile", "sonnet-draft-generation", sonnetSystemProfileArn, "draft-generation",
    );
    const haikuNofoProfile = makeInferenceProfile(
      "HaikuNofoInferenceProfile", "haiku-nofo-pipeline", haikuSystemProfileArn, "nofo-pipeline",
    );
    const haikuScraperProfile = makeInferenceProfile(
      "HaikuScraperInferenceProfile", "haiku-scraper", haikuSystemProfileArn, "nofo-scraper",
    );
    const titanSearchProfile = makeInferenceProfile(
      "TitanSearchInferenceProfile", "titan-grant-search", titanFoundationModelArn, "grant-search",
    );

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

    const jsSharedLayer = new lambda.LayerVersion(scope, "JsSharedLayer", {
      layerVersionName: `${stackName}-js-shared-layer`,
      compatibleRuntimes: [lambda.Runtime.NODEJS_24_X],
      code: lambda.Code.fromAsset(
        path.join(__dirname, "layers/js-shared-layer")
      ),
      description: "Shared Node.js auth and sanitization helpers",
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
          DRAFT_VERSION_TABLE_NAME: props.draftVersionTable.tableName,
          ANALYTICS_TABLE_NAME: props.analyticsTable.tableName,
        },
        timeout: cdk.Duration.seconds(30),
        logGroup: new logs.LogGroup(scope, "DraftHandlerFunctionLogGroup", {
          retention: logs.RetentionDays.THREE_MONTHS,
        }),
      }
    );
    props.analyticsTable.grantWriteData(draftAPIHandlerFunction);
    props.draftVersionTable.grantReadWriteData(draftAPIHandlerFunction);

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

    const draftVersionWriterFunction = new lambda.Function(
      scope,
      "DraftVersionWriterFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromAsset(path.join(__dirname, "draft-version-writer")),
        handler: "lambda_function.lambda_handler",
        layers: [pythonSharedLayer],
        environment: {
          DRAFT_VERSION_TABLE_NAME: props.draftVersionTable.tableName,
          SNAPSHOT_MIN_INTERVAL_SECONDS: "300",
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    props.draftVersionTable.grantReadWriteData(draftVersionWriterFunction);
    draftVersionWriterFunction.addEventSource(
      new DynamoEventSource(props.draftTable, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 10,
        retryAttempts: 3,
        reportBatchItemFailures: true,
      })
    );

    this.draftVersionWriterFunction = draftVersionWriterFunction;

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

    // WebSocket chat function
    const websocketAPIFunction = new lambda.Function(
      scope,
      "ChatHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(path.join(__dirname, "websocket-chat")),
        handler: "index.handler",
        environment: {
          WEBSOCKET_API_ENDPOINT: props.wsApiEndpoint.replace("wss", "https"),
          KB_ID: props.knowledgeBase.attrKnowledgeBaseId,
          SESSION_HANDLER: this.sessionFunction.functionName,
          USER_DOCUMENTS_BUCKET: props.userDocumentsBucket.bucketName,
          SONNET_MODEL_ID: sonnetChatProfile.attrInferenceProfileArn,
          USER_POOL_ID: props.userPool.userPoolId,
          SUPPORTED_STATES: SUPPORTED_STATES_ENV,
          LEGACY_STATELESS_ADMIN_IS_PLATFORM,
          // Flip to "true" once existing NOFOs are sidecar-tagged.
          NOFO_STATE_FILTER_ENABLED: "false",
        },
        timeout: cdk.Duration.seconds(300),
      }
    );

    // WebSocket messages lack JWT claims, so resolve state via AdminGetUser per message.
    websocketAPIFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["cognito-idp:AdminGetUser"],
        resources: [props.userPool.userPoolArn],
      })
    );

    websocketAPIFunction.addEnvironment(
      "NOFO_METADATA_TABLE_NAME",
      props.nofoMetadataTable.tableName
    );
    props.nofoMetadataTable.grantReadData(websocketAPIFunction);

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
        ],
      })
    );

    this.chatFunction = websocketAPIFunction;

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
        runtime: lambda.Runtime.NODEJS_24_X,
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
      lambdaInvokePolicy(kbSyncAPIHandlerFunction.functionArn)
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
      lambdaInvokePolicy(kbSyncAPIHandlerFunction.functionArn)
    );

    this.deleteS3Function = deleteS3APIHandlerFunction;

    const getS3APIHandlerFunction = new lambda.Function(
      scope,
      "GetS3FilesHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
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
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/retrieve-nofos")
        ),
        handler: "index.handler",
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          ENABLE_DYNAMODB_CACHE: "true",
          SUPPORTED_STATES: SUPPORTED_STATES_ENV,
        LEGACY_STATELESS_ADMIN_IS_PLATFORM,
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

    const nofoProcessingDLQ = new sqs.Queue(scope, "NOFOProcessingDLQ", {
      retentionPeriod: cdk.Duration.days(14),
    });

    const nofoProcessingQueue = new sqs.Queue(scope, "NOFOProcessingQueue", {
      visibilityTimeout: cdk.Duration.minutes(2),
      receiveMessageWaitTime: cdk.Duration.seconds(20),
      deadLetterQueue: {
        queue: nofoProcessingDLQ,
        maxReceiveCount: 5,
      },
    });

    // SQS DLQ for scraper downloads
    const scraperDownloadDLQ = new sqs.Queue(scope, "ScraperDownloadDLQ", {
      retentionPeriod: cdk.Duration.days(14),
    });

    // SQS queue for individual opportunity downloads
    const scraperDownloadQueue = new sqs.Queue(scope, "ScraperDownloadQueue", {
      visibilityTimeout: cdk.Duration.minutes(12),
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: scraperDownloadDLQ,
        maxReceiveCount: 3,
      },
    });

    // The NOFO processing pipeline — task Lambdas, state machine, SQS dispatcher, DLQ drain
    // and the admin review API — lives in its own NestedStack to keep the main app stack under
    // the 500-resource CloudFormation limit. The queues, the NOFO bucket, the metadata/review
    // tables, the inference profiles and the KB sync Lambda stay here and are passed in.
    const nofoPipeline = new NofoPipelineStack(scope, "NofoPipelineStack", {
      ffioNofosBucket: props.ffioNofosBucket,
      nofoMetadataTable: props.nofoMetadataTable,
      nofoProcessingReviewTable: props.nofoProcessingReviewTable,
      jsSharedLayer: jsSharedLayer,
      sonnetNofoProfileArn: sonnetNofoProfile.attrInferenceProfileArn,
      haikuNofoProfileArn: haikuNofoProfile.attrInferenceProfileArn,
      syncKBFunctionArn: this.syncKBFunction.functionArn,
      nofoProcessingQueueArn: nofoProcessingQueue.queueArn,
      nofoProcessingQueueUrl: nofoProcessingQueue.queueUrl,
      nofoProcessingDlqArn: nofoProcessingDLQ.queueArn,
      nofoProcessingDlqUrl: nofoProcessingDLQ.queueUrl,
      scraperDownloadDlqArn: scraperDownloadDLQ.queueArn,
      scraperDownloadDlqUrl: scraperDownloadDLQ.queueUrl,
      supportedStatesEnv: SUPPORTED_STATES_ENV,
      legacyStatelessAdminIsPlatform: LEGACY_STATELESS_ADMIN_IS_PLATFORM,
    });

    this.nofoProcessingStateMachine = nofoPipeline.nofoProcessingStateMachine;
    this.nofoAdminFunction = nofoPipeline.nofoAdminFunction;

    // S3 → SQS notifications (same as before)
    props.ffioNofosBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(nofoProcessingQueue),
      { prefix: "", suffix: "NOFO-File-PDF" }
    );
    props.ffioNofosBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(nofoProcessingQueue),
      { prefix: "", suffix: "NOFO-File-TXT" }
    );

    // --- Reprocess Lambda ---

    const nofoReprocessFunction = new lambda.Function(scope, "NofoReprocessFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(path.join(__dirname, "nofo-pipeline")),
      handler: "reprocess/index.handler",
      layers: [jsSharedLayer],
      environment: {
        BUCKET: props.ffioNofosBucket.bucketName,
        QUEUE_URL: nofoProcessingQueue.queueUrl,
        NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
        REVIEW_TABLE_NAME: props.nofoProcessingReviewTable.tableName,
        SUPPORTED_STATES: SUPPORTED_STATES_ENV,
      LEGACY_STATELESS_ADMIN_IS_PLATFORM,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });
    nofoReprocessFunction.addToRolePolicy(s3ReadWritePolicy(props.ffioNofosBucket.bucketArn));
    nofoReprocessFunction.addToRolePolicy(metadataTableReadWritePolicy(props.nofoMetadataTable.tableArn));
    nofoReprocessFunction.addToRolePolicy(reviewTableReadWritePolicy(props.nofoProcessingReviewTable.tableArn));
    nofoReprocessFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["sqs:SendMessage"],
        resources: [nofoProcessingQueue.queueArn],
      })
    );

    this.nofoReprocessFunction = nofoReprocessFunction;

    const RequirementsForNOFOs = new lambda.Function(
      scope,
      "GetRequirementsForNOFOs",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/retrieveNOFOSummary")
        ),
        handler: "index.handler",
        layers: [jsSharedLayer], // for recordEvent / touchLastActive
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          NOFO_STATE_OVERLAY_TABLE_NAME: props.nofoStateOverlayTable.tableName,
          SUPPORTED_STATES: SUPPORTED_STATES_ENV,
          LEGACY_STATELESS_ADMIN_IS_PLATFORM,
          ANALYTICS_TABLE_NAME: props.analyticsTable.tableName,
        },
        timeout: cdk.Duration.minutes(2),
      }
    );
    props.analyticsTable.grantWriteData(RequirementsForNOFOs);

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
    props.nofoMetadataTable.grantReadData(RequirementsForNOFOs);
    props.nofoStateOverlayTable.grantReadData(RequirementsForNOFOs);
    this.getNOFOSummary = RequirementsForNOFOs;

    const NOFOQuestionsForNOFOs = new lambda.Function(
      scope,
      "GetQuestionsForNOFOs",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/retrieveNOFOQuestions")
        ),
        handler: "index.handler",
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          NOFO_STATE_OVERLAY_TABLE_NAME: props.nofoStateOverlayTable.tableName,
          SUPPORTED_STATES: SUPPORTED_STATES_ENV,
        LEGACY_STATELESS_ADMIN_IS_PLATFORM,
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
    props.nofoMetadataTable.grantReadData(NOFOQuestionsForNOFOs);
    props.nofoStateOverlayTable.grantReadData(NOFOQuestionsForNOFOs);
    this.getNOFOQuestions = NOFOQuestionsForNOFOs;

    const nofoUploadS3APIHandlerFunction = new lambda.Function(
      scope,
      "nofoUploadS3FilesHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X, // Choose any supported Node.js runtime
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/upload-nofos")
        ), // Points to the lambda directory
        handler: "index.handler", // Points to the 'hello' file in the lambda directory
        layers: [jsSharedLayer],
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
          SUPPORTED_STATES: SUPPORTED_STATES_ENV,
          LEGACY_STATELESS_ADMIN_IS_PLATFORM,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
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

    props.nofoMetadataTable.grantWriteData(nofoUploadS3APIHandlerFunction);
    this.uploadNOFOS3Function = nofoUploadS3APIHandlerFunction;

    // Add the NOFO status update function
    const nofoStatusHandlerFunction = new lambda.Function(
      scope,
      "NofoStatusHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/nofo-status")
        ),
        handler: "index.handler",
        layers: [jsSharedLayer],
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          ENABLE_DYNAMODB_CACHE: "true",
          SUPPORTED_STATES: SUPPORTED_STATES_ENV,
        LEGACY_STATELESS_ADMIN_IS_PLATFORM,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    nofoStatusHandlerFunction.addToRolePolicy(
      s3ReadWritePolicy(props.ffioNofosBucket.bucketArn)
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

    // NOFO summary content update function
    const nofoSummaryUpdateFunction = new lambda.Function(
      scope,
      "NofoSummaryUpdateFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/nofo-summary-update")
        ),
        handler: "index.handler",
        layers: [jsSharedLayer],
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          ENABLE_DYNAMODB_CACHE: "true",
          SYNC_KB_FUNCTION_NAME: `${stackName}-syncKBFunction`,
          SUPPORTED_STATES: SUPPORTED_STATES_ENV,
        LEGACY_STATELESS_ADMIN_IS_PLATFORM,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    nofoSummaryUpdateFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject", "s3:PutObject"],
        resources: [
          props.ffioNofosBucket.bucketArn,
          props.ffioNofosBucket.bucketArn + "/*",
        ],
      })
    );

    nofoSummaryUpdateFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
        resources: [
          props.nofoMetadataTable.tableArn,
        ],
      })
    );

    nofoSummaryUpdateFunction.addToRolePolicy(
      lambdaInvokePolicy(kbSyncAPIHandlerFunction.functionArn)
    );

    this.nofoSummaryUpdateFunction = nofoSummaryUpdateFunction;

    // State overlay CRUD: a state admin attaches guidance to a federal NOFO (state-locked).
    const nofoStateOverlayFunction = new lambda.Function(scope, "NofoStateOverlayFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(path.join(__dirname, "landing-page/nofo-state-overlay")),
      handler: "index.handler",
      layers: [jsSharedLayer],
      environment: {
        NOFO_STATE_OVERLAY_TABLE_NAME: props.nofoStateOverlayTable.tableName,
        NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
        SUPPORTED_STATES: SUPPORTED_STATES_ENV,
      LEGACY_STATELESS_ADMIN_IS_PLATFORM,
      },
      timeout: cdk.Duration.seconds(30),
    });
    props.nofoStateOverlayTable.grantReadWriteData(nofoStateOverlayFunction);
    props.nofoMetadataTable.grantReadData(nofoStateOverlayFunction);
    this.nofoStateOverlayFunction = nofoStateOverlayFunction;

    // Promote a federal NOFO to a state-owned copy (fork): copy S3 folder + new scope:state row.
    const nofoPromoteCopyFunction = new lambda.Function(scope, "NofoPromoteCopyFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(path.join(__dirname, "landing-page/nofo-promote-copy")),
      handler: "index.handler",
      layers: [jsSharedLayer],
      environment: {
        BUCKET: props.ffioNofosBucket.bucketName,
        NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
        SUPPORTED_STATES: SUPPORTED_STATES_ENV,
      LEGACY_STATELESS_ADMIN_IS_PLATFORM,
      },
      timeout: cdk.Duration.seconds(60),
    });
    nofoPromoteCopyFunction.addToRolePolicy(
      s3ReadWritePolicy(props.ffioNofosBucket.bucketArn)
    );
    props.nofoMetadataTable.grantReadWriteData(nofoPromoteCopyFunction);
    this.nofoPromoteCopyFunction = nofoPromoteCopyFunction;

    // Add the NOFO rename function
    const nofoRenameHandlerFunction = new lambda.Function(
      scope,
      "NofoRenameHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/nofo-rename")
        ),
        handler: "index.handler",
        layers: [jsSharedLayer],
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          NOFO_STATE_OVERLAY_TABLE_NAME: props.nofoStateOverlayTable.tableName,
          ENABLE_DYNAMODB_CACHE: "true",
          SYNC_KB_FUNCTION_NAME: `${stackName}-syncKBFunction`,
          SUPPORTED_STATES: SUPPORTED_STATES_ENV,
        LEGACY_STATELESS_ADMIN_IS_PLATFORM,
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

    // A rename re-creates the metadata row under the new name (the name is the partition key),
    // so it needs write access, not just the read used for the scope check.
    nofoRenameHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"],
        resources: [props.nofoMetadataTable.tableArn],
      })
    );

    props.nofoStateOverlayTable.grantReadWriteData(nofoRenameHandlerFunction);

    // Re-index the KB so it drops the old prefix and picks up the new one.
    nofoRenameHandlerFunction.addToRolePolicy(
      lambdaInvokePolicy(kbSyncAPIHandlerFunction.functionArn)
    );

    this.nofoRenameFunction = nofoRenameHandlerFunction;

    // Add the NOFO delete function
    const nofoDeleteHandlerFunction = new lambda.Function(
      scope,
      "NofoDeleteHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/nofo-delete")
        ),
        handler: "index.handler",
        layers: [jsSharedLayer],
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
          SYNC_KB_FUNCTION_NAME: `${stackName}-syncKBFunction`,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          ENABLE_DYNAMODB_CACHE: "true",
          SUPPORTED_STATES: SUPPORTED_STATES_ENV,
        LEGACY_STATELESS_ADMIN_IS_PLATFORM,
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

    nofoDeleteHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:GetItem",
          "dynamodb:DeleteItem",
        ],
        resources: [
          props.nofoMetadataTable.tableArn,
        ],
      })
    );

    // Grant permission to invoke KB sync function
    nofoDeleteHandlerFunction.addToRolePolicy(
      lambdaInvokePolicy(kbSyncAPIHandlerFunction.functionArn)
    );

    this.nofoDeleteFunction = nofoDeleteHandlerFunction;

    const uploadS3APIHandlerFunction = new lambda.Function(
      scope,
      "UploadS3FilesHandlerFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
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
        runtime: lambda.Runtime.NODEJS_24_X,
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

    // Draft generation pipeline Lambdas and their Step Functions state machine live in
    // their own NestedStack to keep the main app stack under the 500-resource
    // CloudFormation limit. The NOFO bucket, the draft and job tables, the knowledge base
    // and the Bedrock inference profile stay here and are passed in.
    const draftGeneration = new DraftGenerationStack(scope, "DraftGenerationStack", {
      ffioNofosBucket: props.ffioNofosBucket,
      draftTable: props.draftTable,
      draftGenerationJobsTable: props.draftGenerationJobsTable,
      knowledgeBaseId: props.knowledgeBase.attrKnowledgeBaseId,
      sonnetDraftProfileArn: sonnetDraftProfile.attrInferenceProfileArn,
      supportedStatesEnv: SUPPORTED_STATES_ENV,
      legacyStatelessAdminIsPlatform: LEGACY_STATELESS_ADMIN_IS_PLATFORM,
    });

    this.draftGenerationStateMachine = draftGeneration.draftGenerationStateMachine;

    // Scraper fan-out and NOFO lifecycle functions live in their own NestedStack to
    // keep the main app stack under the 500-resource CloudFormation limit. The download
    // queue, the NOFO bucket, the metadata table and the Bedrock inference profile stay
    // here and are passed in.
    const scraper = new ScraperStack(scope, "ScraperStack", {
      ffioNofosBucket: props.ffioNofosBucket,
      nofoMetadataTable: props.nofoMetadataTable,
      jsSharedLayer: jsSharedLayer,
      grantsGovApiKey: props.grantsGovApiKey,
      haikuScraperProfileArn: haikuScraperProfile.attrInferenceProfileArn,
      scraperDownloadQueueArn: scraperDownloadQueue.queueArn,
      scraperDownloadQueueUrl: scraperDownloadQueue.queueUrl,
    });

    this.scraperCoordinatorFunction = scraper.scraperCoordinatorFunction;
    this.opportunityProcessorFunction = scraper.opportunityProcessorFunction;
    this.syncNofoMetadataFunction = scraper.syncNofoMetadataFunction;
    this.autoArchiveExpiredNofosFunction =
      scraper.autoArchiveExpiredNofosFunction;

    // Document conversion functions live in their own NestedStack to keep the
    // main app stack under the 500-resource CloudFormation limit.
    const documentConversion = new DocumentConversionStack(
      scope,
      "DocumentConversionStack",
      {
        ffioNofosBucket: props.ffioNofosBucket,
        analyticsTable: props.analyticsTable,
        jsSharedLayer: jsSharedLayer,
      }
    );

    this.htmlToPdfConverterFunction =
      documentConversion.htmlToPdfConverterFunction;
    this.applicationPdfGeneratorFunction =
      documentConversion.applicationPdfGeneratorFunction;
    this.docxToTextConverterFunction =
      documentConversion.docxToTextConverterFunction;
    this.applicationDocxGeneratorFunction =
      documentConversion.applicationDocxGeneratorFunction;

    // Get the stack object
    const stack = cdk.Stack.of(this);

    // --- NOFO notification digest ------------------------------------------------
    // SES verified sender for digest emails. Branding config is the source of truth for the From
    // address so a new instance doesn't silently send as GrantWell; env is the per-deploy override.
    const notificationSender =
      process.env.NOTIFICATION_SENDER || genericBrandingData.senderEmail;
    const senderDomain =
      notificationSender.split("@")[1] ||
      genericBrandingData.senderEmail.split("@")[1];
    // SES identities are account+region scoped: the generic stack already owns the grantwell.us
    // identity, so a second stack in the same account (burnes-staging) must reuse it, not re-create
    // it. Both still send as the same address; only the primary stack manages the identity.
    const managesSenderIdentity = process.env.ENVIRONMENT !== "grantwell-burnes-staging";
    // Easy DKIM's three CNAME tokens must reach the sender domain's DNS before the identity
    // verifies. They're emitted as this stack's NotificationSenderDkim* outputs.
    const notificationEmailIdentity = managesSenderIdentity
      ? new ses.EmailIdentity(scope, "NotificationSenderIdentity", {
          identity: ses.Identity.domain(senderDomain),
          dkimSigning: true,
          dkimIdentity: ses.DkimIdentity.easyDkim(
            ses.EasyDkimSigningKeyLength.RSA_2048_BIT
          ),
        })
      : undefined;

    if (notificationEmailIdentity) {
      for (const [i, record] of notificationEmailIdentity.dkimRecords.entries()) {
        new cdk.CfnOutput(scope, `NotificationSenderDkimRecord${i + 1}`, {
          value: `${record.name} CNAME ${record.value}`,
          description: `DKIM CNAME to publish in ${senderDomain} DNS before digest mail can send`,
        });
      }
      // Sandbox status can't be detected or changed from CloudFormation, and in a sandbox account
      // digests silently no-op for every unverified recipient.
      new cdk.CfnOutput(scope, "NotificationSenderManualSteps", {
        value: [
          `1. Publish the three NotificationSenderDkimRecord* CNAMEs in ${senderDomain} DNS.`,
          "2. Request SES production access (exit sandbox) for this account+region via AWS Support.",
        ].join(" "),
        description: "Manual post-deploy steps required for digest email delivery",
      });
    }

    // Config set names are account+region scoped, same collision risk as the sender identity.
    const sesConfigurationSet = new ses.ConfigurationSet(
      scope,
      "NotificationDigestConfigurationSet",
      {
        configurationSetName: `${process.env.ENVIRONMENT || stackName}-digest`,
        suppressionReasons: ses.SuppressionReasons.BOUNCES_AND_COMPLAINTS,
      }
    );

    const sesFeedbackTopic = new sns.Topic(scope, "NotificationDigestFeedbackTopic", {
      displayName: "SES digest bounce/complaint feedback",
    });

    sesConfigurationSet.addEventDestination("SnsFeedback", {
      destination: ses.EventDestination.snsTopic(sesFeedbackTopic),
      events: [
        ses.EmailSendingEvent.BOUNCE,
        ses.EmailSendingEvent.COMPLAINT,
        ses.EmailSendingEvent.DELIVERY,
      ],
    });

    // Shared HMAC key for one-click unsubscribe tokens: the digest Lambda signs the per-user token
    // it embeds in each email; the public unsubscribe Lambda verifies it. Same secret must reach
    // both. Generated once and stored in Secrets Manager (no plaintext key in code or env at rest).
    const unsubscribeSecret = new secretsmanager.Secret(scope, "DigestUnsubscribeSecret", {
      description: "HMAC key for GrantWell digest one-click unsubscribe tokens",
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true,
      },
    });

    // Notification digest functions and their schedules live in their own NestedStack to
    // keep the main app stack under the 500-resource CloudFormation limit. The SES identity,
    // configuration set, feedback topic and unsubscribe secret stay here and are passed in.
    const notifications = new NotificationsStack(scope, "NotificationsStack", {
      userNotificationPrefsTable: props.userNotificationPrefsTable,
      nofoMetadataTable: props.nofoMetadataTable,
      digestSendLogTable: props.digestSendLogTable,
      digestSuppressionTable: props.digestSuppressionTable,
      userPool: props.userPool,
      jsSharedLayer: jsSharedLayer,
      sesConfigurationSet: sesConfigurationSet,
      sesFeedbackTopicArn: sesFeedbackTopic.topicArn,
      unsubscribeSecret: unsubscribeSecret,
      notificationSender: notificationSender,
      supportedStatesEnv: SUPPORTED_STATES_ENV,
    });

    // Ensure the identity exists before the sender-scoped policies are exercised.
    if (notificationEmailIdentity) {
      notifications.node.addDependency(notificationEmailIdentity);
    }

    this.notificationDigestFunction = notifications.notificationDigestFunction;
    this.notificationDigestPreviewFunction =
      notifications.notificationDigestPreviewFunction;
    this.notificationDigestBroadcastFunction =
      notifications.notificationDigestBroadcastFunction;
    this.notificationUnsubscribeFunction =
      notifications.notificationUnsubscribeFunction;
    this.notificationSesFeedbackFunction =
      notifications.notificationSesFeedbackFunction;

    // AI Grant Search Lambda (hybrid BM25 + semantic via OpenSearch Serverless)
    const aiGrantSearchFunction = new lambda.Function(
      scope,
      "AIGrantSearchFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/ai-grant-search")
        ),
        handler: "index.handler",
        layers: [jsSharedLayer], // for recordEvent / touchLastActive
        environment: {
          OPENSEARCH_ENDPOINT: `${props.openSearchCollection.attrId}.${stack.region}.aoss.amazonaws.com`,
          OPENSEARCH_INDEX: knowledgeBaseIndexName,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          FEATURE_ROLLOUT_TABLE_NAME: props.featureRolloutTable.tableName,
          TITAN_MODEL_ID: titanSearchProfile.attrInferenceProfileArn,
          ANALYTICS_TABLE_NAME: props.analyticsTable.tableName,
        },
        timeout: cdk.Duration.seconds(30),
        memorySize: 512,
      }
    );
    props.analyticsTable.grantWriteData(aiGrantSearchFunction);

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
          `arn:aws:bedrock:${stack.region}::foundation-model/${TITAN_MODEL_ID}`,
          titanSearchProfile.attrInferenceProfileArn,
        ],
      })
    );

    aiGrantSearchFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan"],
        resources: [
          props.nofoMetadataTable.tableArn,
          `${props.nofoMetadataTable.tableArn}/index/*`,
          props.featureRolloutTable.tableArn,
        ],
      })
    );

    this.aiGrantSearchFunction = aiGrantSearchFunction;

    // --- User profile Lambda (self-service; profile-completion gate + last-activity) ---
    // Reads/writes the PROFILE row in the shared analytics table. Uses the js-shared layer for
    // touchLastActive.
    const userProfileFunction = new lambda.Function(scope, "UserProfileFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(
        path.join(__dirname, "user-management/user-profile")
      ),
      handler: "index.handler",
      layers: [jsSharedLayer],
      environment: {
        ANALYTICS_TABLE_NAME: props.analyticsTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });
    props.analyticsTable.grantReadWriteData(userProfileFunction);
    this.userProfileFunction = userProfileFunction;

    // --- Analytics Lambda (admin dashboard; read-only) ---
    // Aggregates usage events + profile rows from the analytics table and registered-user counts
    // from Cognito. Admin-gated via requireAdmin in the handler (js-shared layer).
    const analyticsFunction = new lambda.Function(scope, "AnalyticsFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(path.join(__dirname, "analytics")),
      handler: "index.handler",
      layers: [jsSharedLayer],
      environment: {
        ANALYTICS_TABLE_NAME: props.analyticsTable.tableName,
        DRAFT_TABLE_NAME: props.draftTable.tableName,
        USER_POOL_ID: props.userPool.userPoolId,
        SUPPORTED_STATES: SUPPORTED_STATES_ENV,
      LEGACY_STATELESS_ADMIN_IS_PLATFORM,
      },
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
    });
    props.analyticsTable.grantReadData(analyticsFunction);
    props.draftTable.grantReadData(analyticsFunction);
    props.userPool.grant(analyticsFunction, "cognito-idp:ListUsers");
    this.analyticsFunction = analyticsFunction;

    // Feedback proxy Lambda — optionally forwards user feedback to an external form.
    // If FEEDBACK_FORM_URL is unset, the Lambda logs the feedback and returns success.
    const feedbackProxyFunction = new lambda.Function(
      scope,
      "FeedbackProxyFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "feedback-proxy")
        ),
        handler: "index.handler",
        timeout: cdk.Duration.seconds(15),
        environment: {
          FEEDBACK_FORM_URL: process.env.FEEDBACK_FORM_URL || "",
        },
      }
    );

    this.feedbackProxyFunction = feedbackProxyFunction;
  }
}
