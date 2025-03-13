/**
 * This file defines an AWS CDK stack that creates and configures S3 buckets.
 * These buckets are used for storing various types of data.
 * The common properties include versioning, automatic deletion, and CORS configuration.
 */

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from "constructs";

// Define common bucket properties
const commonBucketProps: s3.BucketProps = {
  versioned: true,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
  cors: [{
    allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.POST, s3.HttpMethods.PUT, s3.HttpMethods.DELETE],
    allowedOrigins: ['*'],
    allowedHeaders: ["*"]
  }]
};

export class S3BucketStack extends cdk.Stack {
  public readonly feedbackBucket: s3.Bucket;
  public readonly ffioNofosBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create the Feedback Download Bucket
    this.feedbackBucket = new s3.Bucket(this, 'FeedbackDownloadBucket', {
      ...commonBucketProps,
      // bucketName: 'feedback-download', // Uncomment and specify if you need a fixed bucket name
    });

    // Create the FFIO NOFOs Download Bucket
    this.ffioNofosBucket = new s3.Bucket(this, 'FfioNofosDownloadBucket', {
      ...commonBucketProps,
      // bucketName: 'ffioNofos-download', // Uncomment and specify if you need a fixed bucket name
    });
  }
}
