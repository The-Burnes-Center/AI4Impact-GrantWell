/**
 * This file configures API routes for the REST API Gateway.
 * It maps HTTP routes to Lambda functions.
 */

import { aws_apigatewayv2 as apigwv2 } from "aws-cdk-lib";
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

export interface RoutesProps {
  httpApi: apigwv2.HttpApi;
  sessionFunction: lambda.Function;
  feedbackFunction: lambda.Function;
  uploadS3Function: lambda.Function;
  deleteS3Function: lambda.Function;
  getS3Function: lambda.Function;
  uploadNOFOS3Function: lambda.Function;
  getNOFOsFunction: lambda.Function;
  getNOFOSummaryFunction: lambda.Function;
  kbSyncFunction: lambda.Function;
  draftGeneratorFunction: lambda.Function;
  automatedNofoScraperFunction: lambda.Function;
  applicationPdfGeneratorFunction: lambda.Function;
  draftGenerationJobsTableName: string;
}

export class Routes extends Construct {
  constructor(scope: Construct, id: string, props: RoutesProps) {
    super(scope, id);

    // Session Management Lambda Integration
    const sessionIntegration = new HttpLambdaIntegration(
      'SessionIntegration',
      props.sessionFunction
    );

    props.httpApi.addRoutes({
      path: '/sessions',
      methods: [apigwv2.HttpMethod.POST],
      integration: sessionIntegration,
    });

    // Feedback Lambda Integration
    const feedbackIntegration = new HttpLambdaIntegration(
      'FeedbackIntegration',
      props.feedbackFunction
    );

    props.httpApi.addRoutes({
      path: '/feedback',
      methods: [apigwv2.HttpMethod.POST],
      integration: feedbackIntegration,
    });

    // Delete S3 Files Lambda Integration
    const deleteS3FilesIntegration = new HttpLambdaIntegration(
      'DeleteS3FilesIntegration',
      props.deleteS3Function
    );

    props.httpApi.addRoutes({
      path: '/delete-s3',
      methods: [apigwv2.HttpMethod.POST],
      integration: deleteS3FilesIntegration,
    });

    // Get S3 Files Lambda Integration
    const getS3FilesIntegration = new HttpLambdaIntegration(
      'GetS3FilesIntegration',
      props.getS3Function
    );

    props.httpApi.addRoutes({
      path: '/get-s3',
      methods: [apigwv2.HttpMethod.POST],
      integration: getS3FilesIntegration,
    });

    // Upload S3 Files Lambda Integration
    const uploadS3FilesIntegration = new HttpLambdaIntegration(
      'UploadS3FilesIntegration',
      props.uploadS3Function
    );

    props.httpApi.addRoutes({
      path: '/upload-s3',
      methods: [apigwv2.HttpMethod.POST],
      integration: uploadS3FilesIntegration,
    });

    // Upload NOFO S3 Files Lambda Integration
    const uploadNOFOS3FilesIntegration = new HttpLambdaIntegration(
      'UploadNOFOS3FilesIntegration',
      props.uploadNOFOS3Function
    );

    props.httpApi.addRoutes({
      path: '/upload-nofo',
      methods: [apigwv2.HttpMethod.POST],
      integration: uploadNOFOS3FilesIntegration,
    });

    // Get NOFOs S3 Files Lambda Integration
    const getNOFOsIntegration = new HttpLambdaIntegration(
      'GetNOFOsIntegration',
      props.getNOFOsFunction
    );

    props.httpApi.addRoutes({
      path: '/get-nofos',
      methods: [apigwv2.HttpMethod.POST],
      integration: getNOFOsIntegration,
    });

    // NOFO Summary Lambda Integration
    const getNOFOSummaryIntegration = new HttpLambdaIntegration(
      'GetNOFOSummaryIntegration',
      props.getNOFOSummaryFunction
    );

    props.httpApi.addRoutes({
      path: '/get-nofo-summary',
      methods: [apigwv2.HttpMethod.POST],
      integration: getNOFOSummaryIntegration,
    });

    // KB Sync Lambda Integration
    const kbSyncIntegration = new HttpLambdaIntegration(
      'KBSyncIntegration',
      props.kbSyncFunction
    );

    props.httpApi.addRoutes({
      path: '/sync-kb',
      methods: [apigwv2.HttpMethod.POST],
      integration: kbSyncIntegration,
    });

    // Draft Generation Lambda Integration
    // Create a new dedicated Lambda function for the REST API endpoint
    const draftGeneratorAPIFunction = new lambda.Function(this, 'DraftGeneratorAPIFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'draft-generation')),
      handler: 'index.handler',
      environment: {
        DRAFT_GENERATOR_FUNCTION: props.draftGeneratorFunction.functionName,
        DRAFT_GENERATION_JOBS_TABLE_NAME: props.draftGenerationJobsTableName,
      },
      timeout: Duration.seconds(30), // Max allowed by API Gateway HTTP API
    });

    // Grant the API function permission to invoke the Draft Generator function
    draftGeneratorAPIFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [props.draftGeneratorFunction.functionArn],
      })
    );

    // Grant DynamoDB write permissions for creating job status
    draftGeneratorAPIFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:PutItem'],
        resources: [`arn:aws:dynamodb:*:*:table/${props.draftGenerationJobsTableName}`],
      })
    );

    // Create the API integration
    const draftGeneratorIntegration = new HttpLambdaIntegration(
      'DraftGeneratorIntegration',
      draftGeneratorAPIFunction
    );

    // Add the route to the HTTP API
    props.httpApi.addRoutes({
      path: '/draft-generation',
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: draftGeneratorIntegration,
    });

    // Draft Generation Job Status Lambda Integration
    // Allows frontend to poll for async draft generation results
    const draftJobStatusFunction = new lambda.Function(this, 'DraftJobStatusFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'draft-job-status')),
      handler: 'index.handler',
      environment: {
        DRAFT_GENERATION_JOBS_TABLE_NAME: props.draftGenerationJobsTableName,
      },
      timeout: Duration.seconds(10),
    });

    // Grant DynamoDB read permissions
    draftJobStatusFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:GetItem'],
        resources: [`arn:aws:dynamodb:*:*:table/${props.draftGenerationJobsTableName}`],
      })
    );

    const draftJobStatusIntegration = new HttpLambdaIntegration(
      'DraftJobStatusIntegration',
      draftJobStatusFunction
    );

    props.httpApi.addRoutes({
      path: '/draft-generation-jobs/{jobId}',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.OPTIONS],
      integration: draftJobStatusIntegration,
    });

    // Automated NOFO Scraper Lambda Integration
    // Create a new dedicated Lambda function for the REST API endpoint
    const automatedNofoScraperAPIFunction = new lambda.Function(this, 'AutomatedNofoScraperAPIFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'automated-nofo-scraper-api')),
      handler: 'index.handler',
      environment: {
        AUTOMATED_NOFO_SCRAPER_FUNCTION: props.automatedNofoScraperFunction.functionName,
      },
      timeout: Duration.seconds(30),
    });

    // Grant the API function permission to invoke the Automated NOFO Scraper function
    automatedNofoScraperAPIFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [props.automatedNofoScraperFunction.functionArn],
      })
    );

    // Create the API integration
    const automatedNofoScraperIntegration = new HttpLambdaIntegration(
      'AutomatedNofoScraperIntegration',
      automatedNofoScraperAPIFunction
    );

    // Add the route to the HTTP API
    props.httpApi.addRoutes({
      path: '/automated-nofo-scraper',
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: automatedNofoScraperIntegration,
    });

    // Application PDF Generator Lambda Integration
    const applicationPdfGeneratorIntegration = new HttpLambdaIntegration(
      'ApplicationPdfGeneratorIntegration',
      props.applicationPdfGeneratorFunction
    );

    // Add the route to the HTTP API
    props.httpApi.addRoutes({
      path: '/generate-pdf',
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: applicationPdfGeneratorIntegration,
    });
  }
}
