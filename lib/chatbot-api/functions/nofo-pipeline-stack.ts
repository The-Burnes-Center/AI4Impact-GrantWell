/**
 * Nested stack holding the NOFO processing pipeline: the six Step Functions task Lambdas,
 * the state machine itself, the SQS dispatcher, the DLQ drain job and the admin review API
 * Lambda. Split out of the main app stack to stay under the 500-resource CloudFormation
 * limit.
 *
 * The processing queue and both DLQs, the NOFO bucket, the metadata/review tables, the
 * Bedrock inference profiles and the KB sync Lambda stay in the parent: they are shared
 * with functions outside this stack or their physical identity must survive this refactor.
 *
 * The admin Lambda comes along even though it is an API handler, because it invokes the
 * publish Lambda by name (PUBLISH_FUNCTION_NAME) — keeping the pair together keeps that
 * wiring inside one stack.
 */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Table } from "aws-cdk-lib/aws-dynamodb";

import { stackName } from "../../constants";
import { NofoProcessingStateMachine } from "../step-functions/nofo-processing";
import {
  bedrockInvokePolicy,
  metadataTableReadWritePolicy,
  reviewTableReadWritePolicy,
  s3ReadWritePolicy,
  textractPolicy,
} from "./shared-policies";

export interface NofoPipelineStackProps extends cdk.NestedStackProps {
  readonly ffioNofosBucket: s3.Bucket;
  readonly nofoMetadataTable: Table;
  readonly nofoProcessingReviewTable: Table;
  /** Shared with functions outside this stack, so it stays in the parent. */
  readonly jsSharedLayer: lambda.ILayerVersion;
  /** Bedrock application inference profiles owned by the parent. */
  readonly sonnetNofoProfileArn: string;
  readonly haikuNofoProfileArn: string;
  /** Parent-owned KB sync Lambda, invoked by the publish step. */
  readonly syncKBFunctionArn: string;
  /**
   * ARN/URL of the processing queue, which stays in the parent (the bucket notifications that
   * feed it and its DLQ are parent-owned). Imported rather than passed as the Queue object:
   * SqsEventSource binds against a concrete Queue in another stack and a nested stack may not
   * depend on its parent.
   */
  readonly nofoProcessingQueueArn: string;
  readonly nofoProcessingQueueUrl: string;
  readonly nofoProcessingDlqArn: string;
  readonly nofoProcessingDlqUrl: string;
  readonly scraperDownloadDlqArn: string;
  readonly scraperDownloadDlqUrl: string;
  readonly supportedStatesEnv: string;
  readonly legacyStatelessAdminIsPlatform: string;
}

export class NofoPipelineStack extends cdk.NestedStack {
  public readonly nofoProcessingStateMachine: sfn.StateMachine;
  public readonly nofoAdminFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: NofoPipelineStackProps) {
    super(scope, id, props);

    // --- Pipeline Lambda Functions ---

    const extractTextFunction = new lambda.Function(this, "ExtractTextFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(path.join(__dirname, "nofo-pipeline")),
      handler: "extract-text/index.handler",
      environment: {
        NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
      },
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
    });
    extractTextFunction.addToRolePolicy(s3ReadWritePolicy(props.ffioNofosBucket.bucketArn));
    extractTextFunction.addToRolePolicy(textractPolicy());
    extractTextFunction.addToRolePolicy(metadataTableReadWritePolicy(props.nofoMetadataTable.tableArn));

    const extractAndAnalyzeFunction = new lambda.Function(this, "ExtractAndAnalyzeFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(path.join(__dirname, "nofo-pipeline")),
      handler: "extract-and-analyze/index.handler",
      environment: {
        NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
        SONNET_MODEL_ID: props.sonnetNofoProfileArn,
      },
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
    });
    extractAndAnalyzeFunction.addToRolePolicy(s3ReadWritePolicy(props.ffioNofosBucket.bucketArn));
    extractAndAnalyzeFunction.addToRolePolicy(bedrockInvokePolicy());
    extractAndAnalyzeFunction.addToRolePolicy(metadataTableReadWritePolicy(props.nofoMetadataTable.tableArn));

    const synthesizeFunction = new lambda.Function(this, "SynthesizeFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(path.join(__dirname, "nofo-pipeline")),
      handler: "synthesize/index.handler",
      environment: {
        NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
        HAIKU_MODEL_ID: props.haikuNofoProfileArn,
      },
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
    });
    synthesizeFunction.addToRolePolicy(s3ReadWritePolicy(props.ffioNofosBucket.bucketArn));
    synthesizeFunction.addToRolePolicy(bedrockInvokePolicy());
    synthesizeFunction.addToRolePolicy(metadataTableReadWritePolicy(props.nofoMetadataTable.tableArn));

    const validateFunction = new lambda.Function(this, "ValidateFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(path.join(__dirname, "nofo-pipeline")),
      handler: "validate/index.handler",
      environment: {
        NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
      },
      timeout: cdk.Duration.minutes(3),
      memorySize: 512,
    });
    validateFunction.addToRolePolicy(metadataTableReadWritePolicy(props.nofoMetadataTable.tableArn));

    const publishFunction = new lambda.Function(this, "PublishFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(path.join(__dirname, "nofo-pipeline")),
      handler: "publish/index.handler",
      environment: {
        BUCKET: props.ffioNofosBucket.bucketName,
        NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
        SYNC_KB_FUNCTION_NAME: `${stackName}-syncKBFunction`,
      },
      timeout: cdk.Duration.minutes(2),
      memorySize: 256,
    });
    publishFunction.addToRolePolicy(s3ReadWritePolicy(props.ffioNofosBucket.bucketArn));
    publishFunction.addToRolePolicy(metadataTableReadWritePolicy(props.nofoMetadataTable.tableArn));
    publishFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["lambda:InvokeFunction"],
        resources: [props.syncKBFunctionArn],
      })
    );

    const quarantineFunction = new lambda.Function(this, "QuarantineFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(path.join(__dirname, "nofo-pipeline")),
      handler: "quarantine/index.handler",
      environment: {
        REVIEW_TABLE_NAME: props.nofoProcessingReviewTable.tableName,
        NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
      },
      timeout: cdk.Duration.minutes(1),
      memorySize: 256,
    });
    quarantineFunction.addToRolePolicy(s3ReadWritePolicy(props.ffioNofosBucket.bucketArn));
    quarantineFunction.addToRolePolicy(reviewTableReadWritePolicy(props.nofoProcessingReviewTable.tableArn));
    quarantineFunction.addToRolePolicy(metadataTableReadWritePolicy(props.nofoMetadataTable.tableArn));

    // --- Step Functions State Machine ---

    const nofoProcessing = new NofoProcessingStateMachine(
      this,
      "NofoProcessingPipeline",
      {
        extractTextFunction,
        extractAndAnalyzeFunction,
        synthesizeFunction,
        validateFunction,
        publishFunction,
        quarantineFunction,
      }
    );

    this.nofoProcessingStateMachine = nofoProcessing.stateMachine;

    // --- Dispatcher Lambda (SQS -> Step Functions) ---

    const dispatcherFunction = new lambda.Function(this, "PipelineDispatcherFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(path.join(__dirname, "nofo-pipeline")),
      handler: "dispatcher/index.handler",
      environment: {
        STATE_MACHINE_ARN: nofoProcessing.stateMachine.stateMachineArn,
        NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
        REVIEW_TABLE_NAME: props.nofoProcessingReviewTable.tableName,
      },
      // The dispatcher only enqueues work now — it no longer waits for the state machine, which
      // may run up to 30 min (longer than any Lambda can live).
      timeout: cdk.Duration.minutes(1),
      memorySize: 256,
    });

    dispatcherFunction.addToRolePolicy(metadataTableReadWritePolicy(props.nofoMetadataTable.tableArn));
    dispatcherFunction.addToRolePolicy(reviewTableReadWritePolicy(props.nofoProcessingReviewTable.tableArn));
    nofoProcessing.stateMachine.grantStartExecution(dispatcherFunction);
    dispatcherFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["states:DescribeExecution", "states:StopExecution"],
        resources: ["*"],
      })
    );

    const nofoProcessingQueue = sqs.Queue.fromQueueAttributes(
      this,
      "NOFOProcessingQueue",
      {
        queueArn: props.nofoProcessingQueueArn,
        queueUrl: props.nofoProcessingQueueUrl,
      }
    );

    dispatcherFunction.addEventSource(
      new SqsEventSource(nofoProcessingQueue, {
        batchSize: 1,
        maxConcurrency: 5,
        reportBatchItemFailures: true,
      })
    );

    // --- DLQ Processor Lambda (EventBridge schedule) ---

    const dlqProcessorFunction = new lambda.Function(this, "DLQProcessorFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(path.join(__dirname, "nofo-pipeline")),
      handler: "dlq-processor/index.handler",
      environment: {
        DLQ_URL: props.nofoProcessingDlqUrl,
        SCRAPER_DLQ_URL: props.scraperDownloadDlqUrl,
        REVIEW_TABLE_NAME: props.nofoProcessingReviewTable.tableName,
      },
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
    });
    dlqProcessorFunction.addToRolePolicy(reviewTableReadWritePolicy(props.nofoProcessingReviewTable.tableArn));
    dlqProcessorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
        resources: [props.nofoProcessingDlqArn, props.scraperDownloadDlqArn],
      })
    );

    const dlqProcessorRule = new events.Rule(this, "DLQProcessorSchedule", {
      schedule: events.Schedule.rate(cdk.Duration.minutes(15)),
      description: "Process DLQ items into review table every 15 minutes",
    });
    dlqProcessorRule.addTarget(new targets.LambdaFunction(dlqProcessorFunction));

    // --- Admin API Lambda ---

    const nofoAdminFunction = new lambda.Function(this, "NofoAdminFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(path.join(__dirname, "nofo-pipeline")),
      handler: "admin/index.handler",
      layers: [props.jsSharedLayer],
      environment: {
        REVIEW_TABLE_NAME: props.nofoProcessingReviewTable.tableName,
        NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
        BUCKET: props.ffioNofosBucket.bucketName,
        PUBLISH_FUNCTION_NAME: publishFunction.functionName,
        SUPPORTED_STATES: props.supportedStatesEnv,
        LEGACY_STATELESS_ADMIN_IS_PLATFORM: props.legacyStatelessAdminIsPlatform,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });
    nofoAdminFunction.addToRolePolicy(reviewTableReadWritePolicy(props.nofoProcessingReviewTable.tableArn));
    nofoAdminFunction.addToRolePolicy(metadataTableReadWritePolicy(props.nofoMetadataTable.tableArn));
    nofoAdminFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["lambda:InvokeFunction"],
        resources: [publishFunction.functionArn],
      })
    );
    nofoAdminFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:ListBucket", "s3:DeleteObject", "s3:PutObject"],
        resources: [
          props.ffioNofosBucket.bucketArn,
          props.ffioNofosBucket.bucketArn + "/*",
        ],
      })
    );
    nofoAdminFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:DeleteItem"],
        resources: [props.nofoMetadataTable.tableArn],
      })
    );

    this.nofoAdminFunction = nofoAdminFunction;
  }
}
