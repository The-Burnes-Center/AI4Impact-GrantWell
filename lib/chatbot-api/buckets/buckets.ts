/**
 * This file defines an AWS CDK stack that creates and configures S3 buckets.
 * These buckets are used for storing various types of data.
 * The common properties include versioning, automatic deletion, and CORS configuration.
 */

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from "constructs";

export class S3BucketStack extends cdk.Stack {
  public readonly feedbackBucket: s3.Bucket;
  public readonly ffioNofosBucket: s3.Bucket;
  public readonly userDocumentsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
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

    this.feedbackBucket = new s3.Bucket(scope, 'FeedbackDownloadBucket', {
      // bucketName: 'feedback-download',
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [{
        allowedMethods: [s3.HttpMethods.GET,s3.HttpMethods.POST,s3.HttpMethods.PUT,s3.HttpMethods.DELETE],
        allowedOrigins: ['*'], 
        allowedHeaders: ["*"]     
      }]
    });
    this.ffioNofosBucket = new s3.Bucket(scope, 'ffioNofosDownloadBucket', {
      // bucketName: 'ffioNofos-download',
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [{
        allowedMethods: [s3.HttpMethods.GET,s3.HttpMethods.POST,s3.HttpMethods.PUT,s3.HttpMethods.DELETE],
        allowedOrigins: ['*'], 
        allowedHeaders: ["*"]     
      }]
    });
    
    // Bucket for user-uploaded documents (organized by userId/nofoName/)
    this.userDocumentsBucket = new s3.Bucket(scope, 'UserDocumentsBucket', {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [{
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.POST, s3.HttpMethods.PUT, s3.HttpMethods.DELETE],
        allowedOrigins: ['*'],
        allowedHeaders: ["*"]
      }]
    });

    // Grant permission for CDK custom resource handler to configure bucket notifications
    // This allows the BucketNotificationsHandler Lambda to configure S3 event notifications
    // The custom resource handler role needs s3:PutBucketNotification permission
    // Allow any Lambda in the same account to configure notifications (for CDK custom resources)
    const createNotificationPolicy = (bucketArn: string) => {
      return new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('lambda.amazonaws.com')],
        actions: ['s3:PutBucketNotification'],
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