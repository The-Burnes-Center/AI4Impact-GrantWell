/**
 * This file defines an AWS CDK stack that creates and configures S3 buckets.
 * These buckets are used for storing various types of data.
 * The common properties include versioning, automatic deletion, and CORS configuration.
 */

import { NagSuppressions } from 'cdk-nag';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from "constructs";

export class S3BucketStack extends cdk.Stack {
  public readonly ffioNofosBucket: s3.Bucket;
  public readonly userDocumentsBucket: s3.Bucket;
  public readonly grantArtifactsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: cdk.StackProps & { allowedOrigins: string[] }) {
    super(scope, id, props);

    // Create a new S3 bucket
    // this.knowledgeBucket = new s3.Bucket(scope, 'KnowledgeSourceBucket', {      
    //   versioned: true,
    //   removalPolicy: cdk.RemovalPolicy.DESTROY,
    //   autoDeleteObjects: true,
    //   cors: [{
    //     allowedMethods: [s3.HttpMethods.GET,s3.HttpMethods.POST,s3.HttpMethods.PUT,s3.HttpMethods.DELETE],
    //     allowedOrigins: ['*'],      
    //     allowedHeaders: ["*"]
    //   }]
    // });

    const accessLogsBucket = new s3.Bucket(scope, 'S3AccessLogsBucket', {
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{ expiration: cdk.Duration.days(90) }],
    });
    NagSuppressions.addResourceSuppressions(accessLogsBucket, [
      { id: 'AwsSolutions-S1', reason: 'This is the access-logs bucket for the other buckets; logging it to itself would loop.' },
    ]);

    this.ffioNofosBucket = new s3.Bucket(scope, 'ffioNofosDownloadBucket', {
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: 'nofos/',
      // bucketName: 'ffioNofos-download',
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      cors: [{
        allowedMethods: [s3.HttpMethods.GET,s3.HttpMethods.POST,s3.HttpMethods.PUT,s3.HttpMethods.DELETE],
        allowedOrigins: props.allowedOrigins,
        allowedHeaders: ["*"]     
      }]
    });
    
    // Bucket for user-uploaded documents (organized by userId/nofoName/)
    this.userDocumentsBucket = new s3.Bucket(scope, 'UserDocumentsBucket', {
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // A user's delete leaves a noncurrent version behind; remove it after 30 days.
      lifecycleRules: [{ noncurrentVersionExpiration: cdk.Duration.days(30) }],
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: 'user-documents/',
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      cors: [{
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.POST, s3.HttpMethods.PUT, s3.HttpMethods.DELETE],
        allowedOrigins: props.allowedOrigins,
        allowedHeaders: ["*"]
      }]
    });

    // raw-text.txt, summary.json and questions.json per grant; kept out of ffioNofosBucket, which the KB indexes.
    this.grantArtifactsBucket = new s3.Bucket(scope, 'GrantArtifactsBucket', {
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: 'grant-artifacts/',
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      // Admins' browsers upload a live grant's new version straight to _pending/ with a presigned PUT.
      cors: [{
        allowedMethods: [s3.HttpMethods.PUT],
        allowedOrigins: props.allowedOrigins,
        allowedHeaders: ["*"]
      }],
      // The search index builder rewrites _search/ on every grant change; old versions are useless.
      lifecycleRules: [{
        id: 'ExpireOldSearchIndexVersions',
        prefix: '_search/',
        noncurrentVersionExpiration: cdk.Duration.days(1),
        expiredObjectDeleteMarker: true,
      }],
    });

    // Grant permission for CDK custom resource handler to configure bucket notifications
    // This allows the BucketNotificationsHandler Lambda to configure S3 event notifications
    // Note: CDK creates a custom resource handler Lambda that needs s3:PutBucketNotification permission
    // We grant this via bucket policy to allow Lambda service principals from the same account
    const createNotificationPolicy = (bucketArn: string) => {
      return new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('lambda.amazonaws.com')],
        actions: ['s3:PutBucketNotification', 's3:GetBucketNotification'],
        resources: [bucketArn],
        conditions: {
          StringEquals: {
            'aws:SourceAccount': cdk.Stack.of(this).account,
          },
        },
      });
    };

    // Apply to userDocumentsBucket (has event notifications)
    this.userDocumentsBucket.addToResourcePolicy(
      createNotificationPolicy(this.userDocumentsBucket.bucketArn)
    );

    // Apply to ffioNofosBucket (has multiple event notifications)
    this.ffioNofosBucket.addToResourcePolicy(
      createNotificationPolicy(this.ffioNofosBucket.bucketArn)
    );
  }
}
