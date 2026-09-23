/**
 * Nested stack holding the Grants.gov scraper fan-out Lambdas and the NOFO lifecycle
 * Lambdas (metadata sync, expiry auto-archive) plus the EventBridge rules that drive
 * them. Split out of the main app stack to stay under the 500-resource
 * CloudFormation limit.
 *
 * The SQS download queue, the NOFO bucket, the metadata table and the Bedrock
 * inference profile stay in the parent: they are shared with functions outside this
 * stack or their physical identity must survive this refactor.
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
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Table } from "aws-cdk-lib/aws-dynamodb";

import {
  bedrockInvokePolicy,
  metadataTableReadWritePolicy,
  s3ReadOnlyPolicy,
  s3ReadWritePolicy,
} from "./shared-policies";

export interface ScraperStackProps extends cdk.NestedStackProps {
  readonly ffioNofosBucket: s3.Bucket;
  readonly nofoMetadataTable: Table;
  /** Shared with functions outside this stack, so it stays in the parent. */
  readonly jsSharedLayer: lambda.ILayerVersion;
  readonly grantsGovApiKey: string;
  /** Bedrock application inference profile owned by the parent. */
  readonly haikuScraperProfileArn: string;
  /**
   * ARN/URL of the download queue, which stays in the parent (its DLQ and retention are
   * parent-owned state). Imported rather than passed as the Queue object: SqsEventSource
   * binds against a concrete Queue in another stack and a nested stack may not depend on
   * its parent.
   */
  readonly scraperDownloadQueueArn: string;
  readonly scraperDownloadQueueUrl: string;
}

export class ScraperStack extends cdk.NestedStack {
  public readonly scraperCoordinatorFunction: lambda.Function;
  public readonly opportunityProcessorFunction: lambda.Function;
  public readonly syncNofoMetadataFunction: lambda.Function;
  public readonly autoArchiveExpiredNofosFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ScraperStackProps) {
    super(scope, id, props);

    // --- Scraper Fan-Out Architecture ---

    // Coordinator Lambda — paginate search API, dedup via DynamoDB, queue new opportunities
    const scraperCoordinatorFunction = new lambda.Function(
      this,
      "ScraperCoordinatorFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "nofo-scraper")
        ),
        handler: "coordinator/index.handler",
        layers: [props.jsSharedLayer],
        environment: {
          GRANTS_GOV_API_KEY: props.grantsGovApiKey,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          SCRAPER_DOWNLOAD_QUEUE_URL: props.scraperDownloadQueueUrl,
        },
        timeout: cdk.Duration.minutes(15),
        memorySize: 256,
      }
    );

    scraperCoordinatorFunction.addToRolePolicy(metadataTableReadWritePolicy(props.nofoMetadataTable.tableArn));
    scraperCoordinatorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["sqs:SendMessage"],
        resources: [props.scraperDownloadQueueArn],
      })
    );

    this.scraperCoordinatorFunction = scraperCoordinatorFunction;

    // Opportunity Processor Lambda — fetch details, download file, upload to S3, write metadata
    const opportunityProcessorFunction = new lambda.Function(
      this,
      "OpportunityProcessorFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "nofo-scraper")
        ),
        handler: "opportunity-processor/index.handler",
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
          GRANTS_GOV_API_KEY: props.grantsGovApiKey,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          HAIKU_MODEL_ID: props.haikuScraperProfileArn,
        },
        timeout: cdk.Duration.minutes(2),
        memorySize: 256,
      }
    );

    opportunityProcessorFunction.addToRolePolicy(s3ReadWritePolicy(props.ffioNofosBucket.bucketArn));
    opportunityProcessorFunction.addToRolePolicy(bedrockInvokePolicy());
    opportunityProcessorFunction.addToRolePolicy(metadataTableReadWritePolicy(props.nofoMetadataTable.tableArn));

    const scraperDownloadQueue = sqs.Queue.fromQueueAttributes(
      this,
      "ScraperDownloadQueue",
      {
        queueArn: props.scraperDownloadQueueArn,
        queueUrl: props.scraperDownloadQueueUrl,
      }
    );

    opportunityProcessorFunction.addEventSource(
      new SqsEventSource(scraperDownloadQueue, {
        batchSize: 1,
        maxConcurrency: 5,
        reportBatchItemFailures: true,
      })
    );

    this.opportunityProcessorFunction = opportunityProcessorFunction;

    // EventBridge rule to run the coordinator daily at 9 AM UTC.
    // The grantwell-staging environment powers the generic deployment.
    const environment = process.env.ENVIRONMENT;
    if (environment === 'production' || environment === 'grantwell-staging') {
      const scraperRule = new events.Rule(this, 'AutomatedNofoScraperRule', {
        schedule: events.Schedule.cron({
          minute: '0',
          hour: '9',
          day: '*',
          month: '*',
          year: '*',
        }),
        description: 'Trigger scraper coordinator daily at 9 AM UTC',
      });

      scraperRule.addTarget(new targets.LambdaFunction(scraperCoordinatorFunction));
    }

    // Add sync NOFO metadata Lambda function
    const syncNofoMetadataFunction = new lambda.Function(
      this,
      "SyncNofoMetadataFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
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
      s3ReadOnlyPolicy(props.ffioNofosBucket.bucketArn)
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

    // Auto-Archive Expired NOFOs Lambda Function
    const autoArchiveExpiredNofosFunction = new lambda.Function(
      this,
      'AutoArchiveExpiredNofosFunction',
      {
        runtime: lambda.Runtime.NODEJS_24_X,
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
    const autoArchiveRule = new events.Rule(this, 'AutoArchiveExpiredNofosRule', {
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
  }
}
