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
  grantRecommendationFunction: lambda.Function;
  draftGeneratorFunction: lambda.Function; // Add draft generator function prop
  automatedNofoScraperFunction: lambda.Function; // Add automated NOFO scraper function prop
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

    // Grant Recommendation Lambda Integration
    // Create a new dedicated Lambda function for the REST API endpoint
    const grantRecommendationAPIFunction = new lambda.Function(this, 'GrantRecommendationAPIFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'grant-recommendation')),
      handler: 'index.handler',
      environment: {
        GRANT_RECOMMENDATION_FUNCTION: props.grantRecommendationFunction.functionName,
      },
      timeout: Duration.seconds(30),
    });

    // Grant the API function permission to invoke the Grant Recommendation function
    grantRecommendationAPIFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [props.grantRecommendationFunction.functionArn],
      })
    );

    // Create the API integration
    const grantRecommendationIntegration = new HttpLambdaIntegration(
      'GrantRecommendationIntegration',
      grantRecommendationAPIFunction
    );

    // Add the route to the HTTP API
    props.httpApi.addRoutes({
      path: '/grant-recommendations',
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: grantRecommendationIntegration,
    });

    // Draft Generation Lambda Integration
    // Create a new dedicated Lambda function for the REST API endpoint
    const draftGeneratorAPIFunction = new lambda.Function(this, 'DraftGeneratorAPIFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'draft-generation')),
      handler: 'index.handler',
      environment: {
        DRAFT_GENERATOR_FUNCTION: props.draftGeneratorFunction.functionName,
      },
      timeout: Duration.minutes(2),
    });

    // Grant the API function permission to invoke the Draft Generator function
    draftGeneratorAPIFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [props.draftGeneratorFunction.functionArn],
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
  }
}