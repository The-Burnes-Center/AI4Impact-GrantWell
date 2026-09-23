/**
 * Nested stack holding the draft generation Step Functions pipeline: the prepare,
 * per-section generate and assemble Lambdas, their log groups, and the state machine
 * that chains them. Split out of the main app stack to stay under the 500-resource
 * CloudFormation limit.
 *
 * The NOFO bucket, the draft and draft-generation-jobs tables, the knowledge base and
 * the Bedrock inference profile stay in the parent: they are shared with functions
 * outside this stack or their physical identity must survive this refactor.
 *
 * The draft editor API handler and the draft version writer stay in the parent too:
 * the first is an API Gateway integration target, the second binds a DynamoDB stream
 * event source on a parent-owned table.
 */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import { Table } from "aws-cdk-lib/aws-dynamodb";

import { DraftGenerationStateMachine } from "../step-functions/draft-generation";
import {
  bedrockInvokePolicy,
  dynamoUpdateItemPolicy,
  s3ReadOnlyPolicy,
} from "./shared-policies";

export interface DraftGenerationStackProps extends cdk.NestedStackProps {
  readonly ffioNofosBucket: s3.Bucket;
  readonly draftTable: Table;
  readonly draftGenerationJobsTable: Table;
  /** Knowledge base owned by the parent; the prepare step only retrieves from it. */
  readonly knowledgeBaseId: string;
  /** Bedrock application inference profile owned by the parent. */
  readonly sonnetDraftProfileArn: string;
  readonly supportedStatesEnv: string;
  readonly legacyStatelessAdminIsPlatform: string;
}

export class DraftGenerationStack extends cdk.NestedStack {
  public readonly draftGenerationStateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: DraftGenerationStackProps) {
    super(scope, id, props);

    const draftPrepareFunction = new lambda.Function(
      this,
      "DraftPrepareFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "draft-pipeline/prepare")
        ),
        handler: "index.handler",
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
          KB_ID: props.knowledgeBaseId,
          DRAFT_GENERATION_JOBS_TABLE_NAME: props.draftGenerationJobsTable.tableName,
        },
        timeout: cdk.Duration.seconds(60),
        memorySize: 256,
        logGroup: new logs.LogGroup(this, "DraftPrepareFunctionLogGroup", {
          retention: logs.RetentionDays.THREE_MONTHS,
        }),
      }
    );

    draftPrepareFunction.addToRolePolicy(
      s3ReadOnlyPolicy(props.ffioNofosBucket.bucketArn)
    );
    draftPrepareFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:Retrieve", "bedrock-agent:Retrieve"],
        resources: ["*"],
      })
    );
    draftPrepareFunction.addToRolePolicy(
      dynamoUpdateItemPolicy(props.draftGenerationJobsTable.tableArn)
    );

    const draftGenerateSectionFunction = new lambda.Function(
      this,
      "DraftGenerateSectionFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "draft-pipeline/generate-section")
        ),
        handler: "index.handler",
        environment: {
          SONNET_MODEL_ID: props.sonnetDraftProfileArn,
          DRAFT_GENERATION_JOBS_TABLE_NAME: props.draftGenerationJobsTable.tableName,
          SUPPORTED_STATES: props.supportedStatesEnv,
          LEGACY_STATELESS_ADMIN_IS_PLATFORM: props.legacyStatelessAdminIsPlatform,
        },
        timeout: cdk.Duration.minutes(5),
        memorySize: 256,
        logGroup: new logs.LogGroup(this, "DraftGenerateSectionFunctionLogGroup", {
          retention: logs.RetentionDays.THREE_MONTHS,
        }),
      }
    );

    draftGenerateSectionFunction.addToRolePolicy(
      bedrockInvokePolicy()
    );
    draftGenerateSectionFunction.addToRolePolicy(
      dynamoUpdateItemPolicy(props.draftGenerationJobsTable.tableArn)
    );

    const draftAssembleFunction = new lambda.Function(
      this,
      "DraftAssembleFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "draft-pipeline/assemble")
        ),
        handler: "index.handler",
        environment: {
          DRAFT_GENERATION_JOBS_TABLE_NAME: props.draftGenerationJobsTable.tableName,
          DRAFT_TABLE_NAME: props.draftTable.tableName,
        },
        timeout: cdk.Duration.seconds(30),
        memorySize: 128,
        logGroup: new logs.LogGroup(this, "DraftAssembleFunctionLogGroup", {
          retention: logs.RetentionDays.THREE_MONTHS,
        }),
      }
    );

    draftAssembleFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:UpdateItem", "dynamodb:GetItem"],
        resources: [
          props.draftGenerationJobsTable.tableArn,
          props.draftTable.tableArn,
        ],
      })
    );

    const draftGenerationPipeline = new DraftGenerationStateMachine(
      this,
      "DraftGenerationPipeline",
      {
        prepareFunction: draftPrepareFunction,
        generateSectionFunction: draftGenerateSectionFunction,
        assembleFunction: draftAssembleFunction,
        draftGenerationJobsTable: props.draftGenerationJobsTable,
      }
    );

    this.draftGenerationStateMachine = draftGenerationPipeline.stateMachine;
  }
}
