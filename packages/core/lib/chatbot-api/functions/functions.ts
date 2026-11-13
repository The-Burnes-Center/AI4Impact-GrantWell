/**
 * This file defines the LambdaFunctionStack class, which sets up various Lambda functions for the GrantWell application using AWS CDK.
 * These Lambda functions handle session management, S3 operations, and knowledge base synchronization.
 */

import { NagSuppressions } from "cdk-nag";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";
import {
  InstanceConfig,
  limits,
  processingQueueEmailEnabled,
  queueEmailRecipientsParameter,
  regions,
  sesEmail,
  singleState,
  supportedStatesEnv,
} from "../../config/instance-config";

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
import { DynamoEventSource, SqsDlq, SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as cr from "aws-cdk-lib/custom-resources";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import { DocumentConversionStack } from "./document-conversion-stack";
import { NotificationsStack } from "./notifications-stack";
import { ScraperStack } from "./scraper-stack";
import { NofoPipelineStack } from "./nofo-pipeline-stack";
import { DraftGenerationStack } from "./draft-generation-stack";
import {
  lambdaInvokePolicy,
  metadataTableReadWritePolicy,
  reviewTableReadWritePolicy,
  s3ListBucketPolicy,
  s3ObjectReadWriteDeletePolicy,
  s3ReadOnlyPolicy,
  s3ReadWritePolicy,
} from "./shared-policies";

// Platform authority is the explicit PlatformAdmin role. While this is "true", a legacy
// stateless Admin still resolves to platform-wide — the pre-migration form. Flip to "false"
// only after every stateless admin in the pool has been migrated to PlatformAdmin, or they
// lose cross-state access. See scripts/migrate-platform-admins.mjs.
const LEGACY_STATELESS_ADMIN_IS_PLATFORM = "true";

/** A Bedrock model or inference profile the app calls, as the model canary checks it. */
export interface BedrockModelUse {
  readonly label: string;
  readonly kind: "anthropic" | "titan-embed" | "rerank";
  /** Exactly what the app passes as modelId (for rerank, the modelArn). */
  readonly modelId: string;
  /** What invoking it needs bedrock:InvokeModel on: the ID plus the foundation models a profile routes to. */
  readonly invokeResources: string[];
}

interface LambdaFunctionStackProps {
  readonly config: InstanceConfig;
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
  readonly dailyUsageTable: Table;
  readonly applicationOutcomeTable: Table;
  readonly ffioNofosBucket: s3.Bucket;
  readonly grantArtifactsBucket: s3.Bucket;
  readonly userDocumentsBucket: s3.Bucket;
  readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  readonly knowledgeBaseSource: bedrock.CfnDataSource;
  readonly userDocumentsDataSource?: bedrock.CfnDataSource;
  readonly grantsGovApiKey: string;
  readonly digestLogoWidth: number;
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
  public readonly nofoPipelineFunctions: {
    extractText: lambda.Function;
    extractAndAnalyze: lambda.Function;
    synthesize: lambda.Function;
    contentCheck: lambda.Function;
    dispatcher: lambda.Function;
    dlqProcessor: lambda.Function;
  };
  public readonly draftGenerateSectionFunction: lambda.Function;
  public readonly nofoReprocessFunction: lambda.Function;
  public readonly nofoStatusFunction: lambda.Function;
  public readonly nofoRenameFunction: lambda.Function;
  public readonly nofoDeleteFunction: lambda.Function;
  public readonly draftFunction: lambda.Function;
  public readonly draftVersionWriterFunction: lambda.Function;
  public readonly draftVersionWriterFailures: sqs.Queue;
  public readonly draftGenerationStateMachine: sfn.StateMachine;
  public readonly scraperCoordinatorFunction: lambda.Function;
  public readonly opportunityProcessorFunction: lambda.Function;
  public readonly htmlToPdfConverterFunction: lambda.Function;
  public readonly applicationPdfGeneratorFunction: lambda.Function;
  public readonly docxToTextConverterFunction: lambda.Function;
  public readonly applicationDocxGeneratorFunction: lambda.Function;
  public readonly applicationExportsBucket: s3.Bucket;
  public readonly autoArchiveExpiredNofosFunction: lambda.Function;
  public readonly notificationDigestFunction: lambda.Function;
  public readonly processingQueueEmailFunction?: lambda.Function;
  public readonly notificationUnsubscribeFunction: lambda.Function;
  public readonly notificationSesFeedbackFunction: lambda.Function;
  public readonly aiGrantSearchFunction: lambda.Function;
  public readonly searchIndexBuilderFunction: lambda.Function;
  public readonly searchIndexDlq: sqs.Queue;
  public readonly feedbackProxyFunction: lambda.Function;
  public readonly nofoSummaryUpdateFunction: lambda.Function;
  public readonly nofoStateOverlayFunction: lambda.Function;
  public readonly nofoPromoteCopyFunction: lambda.Function;
  public readonly userProfileFunction: lambda.Function;
  public readonly analyticsFunction: lambda.Function;
  public readonly applicationOutcomesFunction: lambda.Function;
  public readonly bedrockModels: BedrockModelUse[];

  constructor(scope: Construct, id: string, props: LambdaFunctionStackProps) {
    super(scope, id);

    const { config } = props;
    const stackName = config.aws.stackName;
    const SUPPORTED_STATES_ENV = supportedStatesEnv(config);
    const SINGLE_STATE_ENV: Record<string, string> = singleState(config) ? { SINGLE_STATE: singleState(config)!.code } : {};

    const SONNET_MODEL_ID = "us.anthropic.claude-sonnet-5-5";
    const HAIKU_MODEL_ID = "us.anthropic.claude-haiku-5-5";
    // In the inference-profile names: a profile's model can't change in place, and its replacement
    // must not reuse the old name, so a model change has to change these too.
    const SONNET_TAG = "sonnet-5-5";
    const HAIKU_TAG = "haiku-5-5";
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
      "SonnetChatInferenceProfile", `${SONNET_TAG}-chat`, sonnetSystemProfileArn, "chat",
    );
    const sonnetNofoProfile = makeInferenceProfile(
      "SonnetNofoInferenceProfile", `${SONNET_TAG}-nofo-pipeline`, sonnetSystemProfileArn, "nofo-pipeline",
    );
    const sonnetDraftProfile = makeInferenceProfile(
      "SonnetDraftInferenceProfile", `${SONNET_TAG}-draft-generation`, sonnetSystemProfileArn, "draft-generation",
    );
    const haikuNofoProfile = makeInferenceProfile(
      "HaikuNofoInferenceProfile", `${HAIKU_TAG}-nofo-pipeline`, haikuSystemProfileArn, "nofo-pipeline",
    );
    const haikuScraperProfile = makeInferenceProfile(
      "HaikuScraperInferenceProfile", `${HAIKU_TAG}-scraper`, haikuSystemProfileArn, "nofo-scraper",
    );
    const sonnetChatVerifyProfile = makeInferenceProfile(
      "SonnetChatVerifyInferenceProfile", `${SONNET_TAG}-chat-verify`, sonnetSystemProfileArn, "chat",
    );
    const titanSearchProfile = makeInferenceProfile(
      "TitanSearchInferenceProfile", "titan-grant-search", titanFoundationModelArn, "grant-search",
    );
    const haikuSearchProfile = makeInferenceProfile(
      "HaikuSearchInferenceProfile", `${HAIKU_TAG}-grant-search`, haikuSystemProfileArn, "grant-search",
    );

    // A US system profile routes to its model in several regions, so the foundation model is granted in any region.
    const claude = (label: string, profile: bedrock.CfnApplicationInferenceProfile, systemProfileId: string, systemProfileArn: string): BedrockModelUse => ({
      label,
      kind: "anthropic",
      modelId: profile.attrInferenceProfileArn,
      invokeResources: [
        profile.attrInferenceProfileArn,
        systemProfileArn,
        `arn:aws:bedrock:*::foundation-model/${systemProfileId.slice(systemProfileId.indexOf(".") + 1)}`,
      ],
    });
    const sonnetChatVerify = claude("chat answer checks (Sonnet)", sonnetChatVerifyProfile, SONNET_MODEL_ID, sonnetSystemProfileArn);
    this.bedrockModels = [
      claude("chat (Sonnet)", sonnetChatProfile, SONNET_MODEL_ID, sonnetSystemProfileArn),
      sonnetChatVerify,
      claude("NOFO analysis (Sonnet)", sonnetNofoProfile, SONNET_MODEL_ID, sonnetSystemProfileArn),
      claude("draft generation (Sonnet)", sonnetDraftProfile, SONNET_MODEL_ID, sonnetSystemProfileArn),
      claude("NOFO synthesis and questions (Haiku)", haikuNofoProfile, HAIKU_MODEL_ID, haikuSystemProfileArn),
      claude("grants.gov scraper (Haiku)", haikuScraperProfile, HAIKU_MODEL_ID, haikuSystemProfileArn),
      claude("grant search profiles (Haiku)", haikuSearchProfile, HAIKU_MODEL_ID, haikuSystemProfileArn),
      // ai-grant-search and the index builder embed through this profile; invoking a profile also needs the model.
      {
        label: "grant search embeddings (Titan)",
        kind: "titan-embed",
        modelId: titanSearchProfile.attrInferenceProfileArn,
        invokeResources: [titanSearchProfile.attrInferenceProfileArn, titanFoundationModelArn],
      },
    ];

    // Create Python shared models Lambda Layer
    const pythonSharedLayer = new lambda.LayerVersion(scope, "PythonSharedLayer", {
      layerVersionName: `${stackName}-python-shared-layer`,
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_13],
      code: lambda.Code.fromAsset(
        path.join(__dirname, "layers/python-shared-layer"), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_13.bundlingImage,
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
        runtime: lambda.Runtime.PYTHON_3_13,
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
        runtime: lambda.Runtime.PYTHON_3_13,
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
    // Holds batch metadata (shard + sequence range), not the records; the stream keeps those for 24 h.
    const draftVersionWriterFailures = new sqs.Queue(scope, "DraftVersionWriterFailures", {
      enforceSSL: true,
      retentionPeriod: cdk.Duration.days(14),
    });
    NagSuppressions.addResourceSuppressions(draftVersionWriterFailures, [
      { id: "AwsSolutions-SQS3", reason: "This queue is itself the stream's failure destination; nothing consumes it to fail again." },
    ]);
    draftVersionWriterFunction.addEventSource(
      new DynamoEventSource(props.draftTable, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 10,
        retryAttempts: 3,
        reportBatchItemFailures: true,
        onFailure: new SqsDlq(draftVersionWriterFailures),
      })
    );

    this.draftVersionWriterFunction = draftVersionWriterFunction;
    this.draftVersionWriterFailures = draftVersionWriterFailures;

    const sessionAPIHandlerFunction = new lambda.Function(
      scope,
      "SessionHandlerFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_13,
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
          "dynamodb:BatchWriteItem",
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
          SESSION_HANDLER: this.sessionFunction.functionName,
          USER_DOCUMENTS_BUCKET: props.userDocumentsBucket.bucketName,
          SONNET_MODEL_ID: sonnetChatProfile.attrInferenceProfileArn,
          VERIFY_MODEL_ID: sonnetChatVerifyProfile.attrInferenceProfileArn,
          USER_POOL_ID: props.userPool.userPoolId,
          SUPPORTED_STATES: SUPPORTED_STATES_ENV,
          LEGACY_STATELESS_ADMIN_IS_PLATFORM,
          ...SINGLE_STATE_ENV,
          DAILY_USAGE_TABLE_NAME: props.dailyUsageTable.tableName,
          CHAT_MESSAGES_PER_DAY: String(limits(config).chatMessagesPerDay),
          ARTIFACTS_BUCKET: props.grantArtifactsBucket.bucketName,
          BUCKET: props.ffioNofosBucket.bucketName,
        },
        timeout: cdk.Duration.seconds(300),
        memorySize: 1024,
        reservedConcurrentExecutions: limits(config).chatConcurrency,
      }
    );
    props.dailyUsageTable.grant(websocketAPIFunction, "dynamodb:UpdateItem");
    websocketAPIFunction.addToRolePolicy(s3ReadOnlyPolicy(props.grantArtifactsBucket.bucketArn));
    websocketAPIFunction.addToRolePolicy(s3ReadOnlyPolicy(props.ffioNofosBucket.bucketArn));

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
        actions: ["bedrock:InvokeModel"],
        resources: sonnetChatVerify.invokeResources,
      })
    );

    // Reads the files a chat selected from the user's library (supporting-documents.mjs).
    websocketAPIFunction.addToRolePolicy(
      s3ReadOnlyPolicy(props.userDocumentsBucket.bucketArn)
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

    // The getChatbotResponse route hands each answer to an async copy of this function. No retries:
    // a retried answer would stream a second time and save a duplicate turn.
    websocketAPIFunction.configureAsyncInvoke({ retryAttempts: 0, maxEventAge: cdk.Duration.minutes(2) });
    // In the role's default policy the grant would reference the function, which already depends on
    // that policy, and CloudFormation rejects the loop.
    new iam.Policy(scope, "ChatHandlerSelfInvokePolicy", {
      roles: [websocketAPIFunction.role!],
      statements: [
        new iam.PolicyStatement({
          actions: ["lambda:InvokeFunction"],
          resources: [websocketAPIFunction.functionArn],
        }),
      ],
    });

    this.chatFunction = websocketAPIFunction;

    const kbSyncAPIHandlerFunction = new lambda.Function(
      scope,
      "SyncKBHandlerFunction",
      {
        functionName: `${stackName}-syncKBFunction`,
        runtime: lambda.Runtime.PYTHON_3_13,
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
        runtime: lambda.Runtime.PYTHON_3_13,
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
        layers: [jsSharedLayer],
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
          ARTIFACTS_BUCKET: props.grantArtifactsBucket.bucketName,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          ENABLE_DYNAMODB_CACHE: "true",
          SUPPORTED_STATES: SUPPORTED_STATES_ENV,
        LEGACY_STATELESS_ADMIN_IS_PLATFORM,
        },
        timeout: cdk.Duration.minutes(3),
      }
    );

    getS3APIHandlerFunctionForNOFOs.addToRolePolicy(s3ReadOnlyPolicy(props.ffioNofosBucket.bucketArn));

    getS3APIHandlerFunctionForNOFOs.addToRolePolicy(s3ReadOnlyPolicy(props.grantArtifactsBucket.bucketArn));

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
      enforceSSL: true,
      retentionPeriod: cdk.Duration.days(14),
    });

    const nofoProcessingQueue = new sqs.Queue(scope, "NOFOProcessingQueue", {
      enforceSSL: true,
      visibilityTimeout: cdk.Duration.minutes(2),
      receiveMessageWaitTime: cdk.Duration.seconds(20),
      deadLetterQueue: {
        queue: nofoProcessingDLQ,
        maxReceiveCount: 5,
      },
    });

    // SQS DLQ for scraper downloads
    const scraperDownloadDLQ = new sqs.Queue(scope, "ScraperDownloadDLQ", {
      enforceSSL: true,
      retentionPeriod: cdk.Duration.days(14),
    });

    // SQS queue for individual opportunity downloads
    const scraperDownloadQueue = new sqs.Queue(scope, "ScraperDownloadQueue", {
      enforceSSL: true,
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
      stackName,
      ffioNofosBucket: props.ffioNofosBucket,
      grantArtifactsBucket: props.grantArtifactsBucket,
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
      singleStateEnv: SINGLE_STATE_ENV,
    });

    this.nofoProcessingStateMachine = nofoPipeline.nofoProcessingStateMachine;
    this.nofoAdminFunction = nofoPipeline.nofoAdminFunction;
    this.nofoPipelineFunctions = {
      extractText: nofoPipeline.extractTextFunction,
      extractAndAnalyze: nofoPipeline.extractAndAnalyzeFunction,
      synthesize: nofoPipeline.synthesizeFunction,
      contentCheck: nofoPipeline.validateFunction,
      dispatcher: nofoPipeline.dispatcherFunction,
      dlqProcessor: nofoPipeline.dlqProcessorFunction,
    };

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
    // A live grant's new version is staged here until it publishes (PENDING_PREFIX in grantwell-shared).
    for (const suffix of ["NOFO-File-PDF", "NOFO-File-TXT"]) {
      props.grantArtifactsBucket.addEventNotification(
        s3.EventType.OBJECT_CREATED,
        new s3n.SqsDestination(nofoProcessingQueue),
        { prefix: "_pending/", suffix }
      );
    }

    // --- Reprocess Lambda ---

    const nofoReprocessFunction = new lambda.Function(scope, "NofoReprocessFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(path.join(__dirname, "nofo-pipeline")),
      handler: "reprocess/index.handler",
      layers: [jsSharedLayer],
      environment: {
        BUCKET: props.ffioNofosBucket.bucketName,
        ARTIFACTS_BUCKET: props.grantArtifactsBucket.bucketName,
        QUEUE_URL: nofoProcessingQueue.queueUrl,
        NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
        REVIEW_TABLE_NAME: props.nofoProcessingReviewTable.tableName,
        SUPPORTED_STATES: SUPPORTED_STATES_ENV,
      LEGACY_STATELESS_ADMIN_IS_PLATFORM,
      ...SINGLE_STATE_ENV,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });
    nofoReprocessFunction.addToRolePolicy(s3ReadWritePolicy(props.ffioNofosBucket.bucketArn));
    nofoReprocessFunction.addToRolePolicy(s3ListBucketPolicy(props.grantArtifactsBucket.bucketArn));
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
          ARTIFACTS_BUCKET: props.grantArtifactsBucket.bucketName,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          NOFO_STATE_OVERLAY_TABLE_NAME: props.nofoStateOverlayTable.tableName,
          SUPPORTED_STATES: SUPPORTED_STATES_ENV,
          LEGACY_STATELESS_ADMIN_IS_PLATFORM,
          ...SINGLE_STATE_ENV,
          ANALYTICS_TABLE_NAME: props.analyticsTable.tableName,
        },
        timeout: cdk.Duration.minutes(2),
      }
    );
    props.analyticsTable.grantWriteData(RequirementsForNOFOs);

    RequirementsForNOFOs.addToRolePolicy(s3ReadOnlyPolicy(props.ffioNofosBucket.bucketArn));
    RequirementsForNOFOs.addToRolePolicy(s3ReadOnlyPolicy(props.grantArtifactsBucket.bucketArn));
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
        layers: [jsSharedLayer],
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
          ARTIFACTS_BUCKET: props.grantArtifactsBucket.bucketName,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          NOFO_STATE_OVERLAY_TABLE_NAME: props.nofoStateOverlayTable.tableName,
          SUPPORTED_STATES: SUPPORTED_STATES_ENV,
        LEGACY_STATELESS_ADMIN_IS_PLATFORM,
          ...SINGLE_STATE_ENV,
        },
        timeout: cdk.Duration.minutes(2),
      }
    );

    NOFOQuestionsForNOFOs.addToRolePolicy(s3ReadOnlyPolicy(props.ffioNofosBucket.bucketArn));
    NOFOQuestionsForNOFOs.addToRolePolicy(s3ReadOnlyPolicy(props.grantArtifactsBucket.bucketArn));
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
          ...SINGLE_STATE_ENV,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          ARTIFACTS_BUCKET: props.grantArtifactsBucket.bucketName,
        },
        timeout: cdk.Duration.seconds(60),
      }
    );

    // Signs admins' upload URLs; it never reads or deletes.
    nofoUploadS3APIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:PutObject"],
        resources: [props.ffioNofosBucket.bucketArn + "/*"],
      })
    );

    // Signs the upload of a live grant's new version, which waits in _pending/.
    nofoUploadS3APIHandlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:PutObject"],
        resources: [props.grantArtifactsBucket.arnForObjects("_pending/*")],
      })
    );

    props.nofoMetadataTable.grantReadWriteData(nofoUploadS3APIHandlerFunction);
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
          ARTIFACTS_BUCKET: props.grantArtifactsBucket.bucketName,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          ENABLE_DYNAMODB_CACHE: "true",
          SUPPORTED_STATES: SUPPORTED_STATES_ENV,
        LEGACY_STATELESS_ADMIN_IS_PLATFORM,
        ...SINGLE_STATE_ENV,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    nofoStatusHandlerFunction.addToRolePolicy(
      s3ReadWritePolicy(props.ffioNofosBucket.bucketArn)
    );
    nofoStatusHandlerFunction.addToRolePolicy(s3ReadWritePolicy(props.grantArtifactsBucket.bucketArn));

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
          ARTIFACTS_BUCKET: props.grantArtifactsBucket.bucketName,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          ENABLE_DYNAMODB_CACHE: "true",
          SUPPORTED_STATES: SUPPORTED_STATES_ENV,
        LEGACY_STATELESS_ADMIN_IS_PLATFORM,
        ...SINGLE_STATE_ENV,
          CITE_REQUIREMENTS_FUNCTION_NAME: `${stackName}-citeRequirementsFunction`,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    nofoSummaryUpdateFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["lambda:InvokeFunction"],
        resources: [`arn:aws:lambda:${region}:${account}:function:${stackName}-citeRequirementsFunction`],
      })
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

    nofoSummaryUpdateFunction.addToRolePolicy(s3ReadWritePolicy(props.grantArtifactsBucket.bucketArn));

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
        ARTIFACTS_BUCKET: props.grantArtifactsBucket.bucketName,
        NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
        SUPPORTED_STATES: SUPPORTED_STATES_ENV,
      LEGACY_STATELESS_ADMIN_IS_PLATFORM,
      },
      timeout: cdk.Duration.seconds(60),
    });
    nofoPromoteCopyFunction.addToRolePolicy(
      s3ReadWritePolicy(props.ffioNofosBucket.bucketArn)
    );
    nofoPromoteCopyFunction.addToRolePolicy(s3ReadWritePolicy(props.grantArtifactsBucket.bucketArn));
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
          ARTIFACTS_BUCKET: props.grantArtifactsBucket.bucketName,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          NOFO_STATE_OVERLAY_TABLE_NAME: props.nofoStateOverlayTable.tableName,
          ENABLE_DYNAMODB_CACHE: "true",
          SYNC_KB_FUNCTION_NAME: `${stackName}-syncKBFunction`,
          SUPPORTED_STATES: SUPPORTED_STATES_ENV,
        LEGACY_STATELESS_ADMIN_IS_PLATFORM,
        ...SINGLE_STATE_ENV,
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

    nofoRenameHandlerFunction.addToRolePolicy(s3ListBucketPolicy(props.grantArtifactsBucket.bucketArn));
    nofoRenameHandlerFunction.addToRolePolicy(s3ObjectReadWriteDeletePolicy(props.grantArtifactsBucket.bucketArn));

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
          ARTIFACTS_BUCKET: props.grantArtifactsBucket.bucketName,
          SYNC_KB_FUNCTION_NAME: `${stackName}-syncKBFunction`,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          ENABLE_DYNAMODB_CACHE: "true",
          SUPPORTED_STATES: SUPPORTED_STATES_ENV,
        LEGACY_STATELESS_ADMIN_IS_PLATFORM,
        ...SINGLE_STATE_ENV,
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

    nofoDeleteHandlerFunction.addToRolePolicy(s3ListBucketPolicy(props.grantArtifactsBucket.bucketArn));
    nofoDeleteHandlerFunction.addToRolePolicy(s3ObjectReadWriteDeletePolicy(props.grantArtifactsBucket.bucketArn));

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
      grantArtifactsBucket: props.grantArtifactsBucket,
      userDocumentsBucket: props.userDocumentsBucket,
      draftTable: props.draftTable,
      draftGenerationJobsTable: props.draftGenerationJobsTable,
      jsSharedLayer: jsSharedLayer,
      sonnetDraftProfileArn: sonnetDraftProfile.attrInferenceProfileArn,
      supportedStatesEnv: SUPPORTED_STATES_ENV,
      legacyStatelessAdminIsPlatform: LEGACY_STATELESS_ADMIN_IS_PLATFORM,
      // Shares the NOFO pipeline's Haiku profile (and its cost tag).
      haikuDraftPlanProfileArn: haikuNofoProfile.attrInferenceProfileArn,
      dailyUsageTable: props.dailyUsageTable,
    });

    this.draftGenerationStateMachine = draftGeneration.draftGenerationStateMachine;
    this.draftGenerateSectionFunction = draftGeneration.draftGenerateSectionFunction;

    // Scraper fan-out and NOFO lifecycle functions live in their own NestedStack to
    // keep the main app stack under the 500-resource CloudFormation limit. The download
    // queue, the NOFO bucket, the metadata table and the Bedrock inference profile stay
    // here and are passed in.
    const scraper = new ScraperStack(scope, "ScraperStack", {
      dailySchedule: config.scraper.dailySchedule,
      ffioNofosBucket: props.ffioNofosBucket,
      grantArtifactsBucket: props.grantArtifactsBucket,
      nofoMetadataTable: props.nofoMetadataTable,
      jsSharedLayer: jsSharedLayer,
      grantsGovApiKey: props.grantsGovApiKey,
      haikuScraperProfileArn: haikuScraperProfile.attrInferenceProfileArn,
      scraperDownloadQueueArn: scraperDownloadQueue.queueArn,
      scraperDownloadQueueUrl: scraperDownloadQueue.queueUrl,
      supportedStatesEnv: SUPPORTED_STATES_ENV,
      legacyStatelessAdminIsPlatform: LEGACY_STATELESS_ADMIN_IS_PLATFORM,
      singleStateEnv: SINGLE_STATE_ENV,
    });

    this.scraperCoordinatorFunction = scraper.scraperCoordinatorFunction;
    this.opportunityProcessorFunction = scraper.opportunityProcessorFunction;
    this.autoArchiveExpiredNofosFunction =
      scraper.autoArchiveExpiredNofosFunction;

    // Document conversion functions live in their own NestedStack to keep the
    // main app stack under the 500-resource CloudFormation limit.
    const documentConversion = new DocumentConversionStack(
      scope,
      "DocumentConversionStack",
      {
        ffioNofosBucket: props.ffioNofosBucket,
        grantArtifactsBucket: props.grantArtifactsBucket,
        analyticsTable: props.analyticsTable,
        jsSharedLayer: jsSharedLayer,
        nofoProcessingReviewTable: props.nofoProcessingReviewTable,
        draftGenerationJobsTable: props.draftGenerationJobsTable,
      }
    );

    this.htmlToPdfConverterFunction =
      documentConversion.htmlToPdfConverterFunction;
    this.applicationExportsBucket = documentConversion.applicationExportsBucket;
    this.applicationPdfGeneratorFunction =
      documentConversion.applicationPdfGeneratorFunction;
    this.docxToTextConverterFunction =
      documentConversion.docxToTextConverterFunction;
    this.applicationDocxGeneratorFunction =
      documentConversion.applicationDocxGeneratorFunction;

    // Get the stack object
    const stack = cdk.Stack.of(this);

    // --- NOFO notification digest ------------------------------------------------
    const sesConfig = sesEmail(config);
    const notificationSender = sesConfig?.sender;
    const senderDomain = notificationSender?.split("@")[1];
    // SES identities are account+region scoped: a second deployment in the same account must reuse
    // the identity the first one owns, not re-create it.
    const managesSenderIdentity = sesConfig?.manageSenderIdentity ?? false;
    // Easy DKIM's three CNAME tokens must reach the sender domain's DNS before the identity
    // verifies. They're emitted as this stack's NotificationSenderDkim* outputs.
    const notificationEmailIdentity = managesSenderIdentity
      ? new ses.EmailIdentity(scope, "NotificationSenderIdentity", {
          identity: ses.Identity.domain(senderDomain!),
          dkimSigning: true,
          // No explicit easyDkim() key length: it renders DkimSigningAttributes, so every stack
          // update calls PutEmailIdentityDkimSigningAttributes and 400s with "key length
          // preference was already set" on an identity already at that length.
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
        configurationSetName: `${config.aws.environment}-digest`,
        suppressionReasons: ses.SuppressionReasons.BOUNCES_AND_COMPLAINTS,
      }
    );

    const sesFeedbackTopic = new sns.Topic(scope, "NotificationDigestFeedbackTopic", {
      enforceSSL: true,
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
    NagSuppressions.addResourceSuppressions(unsubscribeSecret, [
      { id: "AwsSolutions-SMG4", reason: "Rotating the HMAC key would break the unsubscribe link in every email already sent." },
    ]);

    // Notification digest functions and their schedules live in their own NestedStack to
    // keep the main app stack under the 500-resource CloudFormation limit. The SES identity,
    // configuration set, feedback topic and unsubscribe secret stay here and are passed in.
    const notifications = new NotificationsStack(scope, "NotificationsStack", {
      siteUrl: config.siteUrl,
      branding: config.branding,
      digestLogoWidth: props.digestLogoWidth,
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
      nofoProcessingReviewTable: props.nofoProcessingReviewTable,
      processingQueueEmail: processingQueueEmailEnabled(config)
        ? { recipientsParameter: queueEmailRecipientsParameter(config), deploymentId: config.id }
        : undefined,
    });

    // Ensure the identity exists before the sender-scoped policies are exercised.
    if (notificationEmailIdentity) {
      notifications.node.addDependency(notificationEmailIdentity);
    }

    this.notificationDigestFunction = notifications.notificationDigestFunction;
    this.notificationUnsubscribeFunction =
      notifications.notificationUnsubscribeFunction;
    this.notificationSesFeedbackFunction =
      notifications.notificationSesFeedbackFunction;
    this.processingQueueEmailFunction = notifications.processingQueueEmailFunction;

    // AI Grant Search Lambda (hybrid BM25 + semantic over the per-grant index in the artifacts bucket)
    const titanSearchInvoke = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["bedrock:InvokeModel"],
      resources: [titanFoundationModelArn, titanSearchProfile.attrInferenceProfileArn],
    });
    // ListBucket makes a missing index file a 404 (index still building), not a 403.
    const listArtifacts = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["s3:ListBucket"],
      resources: [props.grantArtifactsBucket.bucketArn],
    });

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
          SEARCH_INDEX_BUCKET: props.grantArtifactsBucket.bucketName,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          FEATURE_ROLLOUT_TABLE_NAME: props.featureRolloutTable.tableName,
          TITAN_MODEL_ID: titanSearchProfile.attrInferenceProfileArn,
          ANALYTICS_TABLE_NAME: props.analyticsTable.tableName,
          SUPPORTED_STATES: SUPPORTED_STATES_ENV,
          LEGACY_STATELESS_ADMIN_IS_PLATFORM,
          ...SINGLE_STATE_ENV,
        },
        timeout: cdk.Duration.seconds(30),
        // Holds the decoded index (about 8 MB for 2,000 grants); more memory also means more CPU for ranking.
        memorySize: 1024,
      }
    );
    props.analyticsTable.grantWriteData(aiGrantSearchFunction);
    aiGrantSearchFunction.addToRolePolicy(titanSearchInvoke);
    aiGrantSearchFunction.addToRolePolicy(listArtifacts);
    aiGrantSearchFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject"],
        resources: [props.grantArtifactsBucket.arnForObjects("_search/*")],
      })
    );
    aiGrantSearchFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:GetItem", "dynamodb:Scan"],
        resources: [props.nofoMetadataTable.tableArn, props.featureRolloutTable.tableArn],
      })
    );

    // Search index builder: summary.json changes reach it through this queue, so a burst of
    // publishes, renames or edits becomes one incremental build.
    const searchIndexDlq = new sqs.Queue(scope, "SearchIndexDLQ", {
      enforceSSL: true,
      retentionPeriod: cdk.Duration.days(14),
    });
    const searchIndexQueue = new sqs.Queue(scope, "SearchIndexQueue", {
      enforceSSL: true,
      deliveryDelay: cdk.Duration.seconds(30),
      visibilityTimeout: cdk.Duration.minutes(20),
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: { queue: searchIndexDlq, maxReceiveCount: 3 },
    });

    const searchIndexBuilderFunction = new lambda.Function(scope, "SearchIndexBuilderFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(path.join(__dirname, "landing-page/ai-grant-search")),
      handler: "builder.handler",
      environment: {
        ARTIFACTS_BUCKET: props.grantArtifactsBucket.bucketName,
        BUCKET: props.ffioNofosBucket.bucketName,
        NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
        TITAN_MODEL_ID: titanSearchProfile.attrInferenceProfileArn,
        HAIKU_MODEL_ID: haikuSearchProfile.attrInferenceProfileArn,
        QUEUE_URL: searchIndexQueue.queueUrl,
      },
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      retryAttempts: 1,
      description: "Rebuilds the per-grant AI search index in the grant artifacts bucket",
    });
    searchIndexBuilderFunction.addToRolePolicy(titanSearchInvoke);
    searchIndexBuilderFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: [
          haikuSearchProfile.attrInferenceProfileArn,
          haikuSystemProfileArn,
          `arn:aws:bedrock:*::foundation-model/${HAIKU_MODEL_ID.slice(HAIKU_MODEL_ID.indexOf(".") + 1)}`,
        ],
      })
    );
    searchIndexBuilderFunction.addToRolePolicy(listArtifacts);
    searchIndexBuilderFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject"],
        resources: [props.grantArtifactsBucket.arnForObjects("*")],
      })
    );
    searchIndexBuilderFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:PutObject", "s3:DeleteObject"],
        resources: [props.grantArtifactsBucket.arnForObjects("_search/*")],
      })
    );
    // Summaries written before the artifacts bucket existed are still read from the grant bucket.
    searchIndexBuilderFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject"],
        resources: [props.ffioNofosBucket.arnForObjects("*/summary.json"), props.ffioNofosBucket.arnForObjects("*/raw-text.txt")],
      })
    );
    searchIndexBuilderFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:ListBucket"],
        resources: [props.ffioNofosBucket.bucketArn],
      })
    );
    searchIndexBuilderFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:Scan"],
        resources: [props.nofoMetadataTable.tableArn],
      })
    );
    searchIndexBuilderFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["sqs:SendMessage"],
        resources: [searchIndexQueue.queueArn],
      })
    );
    searchIndexBuilderFunction.addEventSource(
      new SqsEventSource(searchIndexQueue, {
        batchSize: 100,
        maxBatchingWindow: cdk.Duration.seconds(60),
        maxConcurrency: 2,
      })
    );

    // Every grant change writes or removes <grant>/summary.json: publish, admin edits, status
    // and archive changes, rename (copy + delete), promote-copy and delete.
    for (const eventType of [s3.EventType.OBJECT_CREATED, s3.EventType.OBJECT_REMOVED]) {
      props.grantArtifactsBucket.addEventNotification(eventType, new s3n.SqsDestination(searchIndexQueue), { suffix: "/summary.json" });
    }

    // 06:30 UTC: clear of the 02:00 archive, 09:00 scrape and 14:00 Eastern digest runs.
    new events.Rule(scope, "SearchIndexNightlyRule", {
      schedule: events.Schedule.cron({ minute: "30", hour: "6" }),
      description: "Nightly full rebuild of the AI grant search index",
      targets: [new targets.LambdaFunction(searchIndexBuilderFunction, { event: events.RuleTargetInput.fromObject({ full: true }) })],
    });

    // The first deploy queues a build so the index exists soon after; bump the key to rebuild on deploy.
    const initialBuild: cr.AwsSdkCall = {
      service: "SQS",
      action: "sendMessage",
      parameters: { QueueUrl: searchIndexQueue.queueUrl, MessageBody: JSON.stringify({ deploy: "search-index-v1" }) },
      physicalResourceId: cr.PhysicalResourceId.of("search-index-initial-build"),
    };
    const searchIndexInitialBuild = new cr.AwsCustomResource(scope, "SearchIndexInitialBuild", {
      onCreate: initialBuild,
      onUpdate: initialBuild,
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({ actions: ["sqs:SendMessage"], resources: [searchIndexQueue.queueArn] }),
      ]),
      installLatestAwsSdk: false,
    });
    searchIndexInitialBuild.node.addDependency(searchIndexBuilderFunction);

    this.searchIndexBuilderFunction = searchIndexBuilderFunction;
    this.searchIndexDlq = searchIndexDlq;
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
        ...(regions(config).length && { REGIONS: JSON.stringify(regions(config)) }),
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

    // Application outcomes: users record and are reminded about them; admins read them all.
    const applicationOutcomesFunction = new lambda.Function(scope, "ApplicationOutcomesFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(path.join(__dirname, "application-outcomes")),
      handler: "index.handler",
      layers: [jsSharedLayer],
      environment: {
        OUTCOME_TABLE_NAME: props.applicationOutcomeTable.tableName,
        DRAFT_TABLE_NAME: props.draftTable.tableName,
        NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
        ANALYTICS_TABLE_NAME: props.analyticsTable.tableName,
        USER_POOL_ID: props.userPool.userPoolId,
        SUPPORTED_STATES: SUPPORTED_STATES_ENV,
        LEGACY_STATELESS_ADMIN_IS_PLATFORM,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
    });
    props.applicationOutcomeTable.grantReadWriteData(applicationOutcomesFunction);
    props.draftTable.grantReadData(applicationOutcomesFunction);
    props.nofoMetadataTable.grantReadData(applicationOutcomesFunction);
    props.analyticsTable.grantReadData(applicationOutcomesFunction);
    props.userPool.grant(applicationOutcomesFunction, "cognito-idp:ListUsers");
    this.applicationOutcomesFunction = applicationOutcomesFunction;

    // Feedback proxy Lambda — optionally forwards user feedback to an external form.
    // If feedbackFormUrl is unset, the Lambda logs the feedback and returns success.
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
          FEEDBACK_FORM_URL: config.feedbackFormUrl ?? "",
        },
      }
    );

    this.feedbackProxyFunction = feedbackProxyFunction;
  }
}
