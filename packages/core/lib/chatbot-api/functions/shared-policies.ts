/**
 * IAM policy statements shared by the main app stack (functions.ts) and the nested
 * stacks split out of it.
 *
 * These are factories, not shared constants: a PolicyStatement is mutable and CDK
 * freezes it once rendered, so handing the same instance to roles in two different
 * stacks makes one stack's grants observable from the other. Every call returns a
 * fresh statement.
 *
 * Signatures take plain ARN strings rather than constructs so nested stacks can call
 * them with the parent-owned ARNs they receive as props, without importing the
 * construct across the stack boundary.
 */

import * as iam from "aws-cdk-lib/aws-iam";

export function s3ReadWritePolicy(bucketArn: string): iam.PolicyStatement {
  return new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
    resources: [bucketArn, `${bucketArn}/*`],
  });
}

export function s3ReadOnlyPolicy(bucketArn: string): iam.PolicyStatement {
  return new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["s3:GetObject", "s3:ListBucket"],
    resources: [bucketArn, `${bucketArn}/*`],
  });
}

export function s3ListBucketPolicy(bucketArn: string): iam.PolicyStatement {
  return new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["s3:ListBucket"],
    resources: [bucketArn],
  });
}

export function s3ObjectReadWriteDeletePolicy(bucketArn: string): iam.PolicyStatement {
  return new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
    resources: [`${bucketArn}/*`],
  });
}

export function bedrockInvokePolicy(): iam.PolicyStatement {
  return new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["bedrock:InvokeModel"],
    resources: ["*"],
  });
}

export function textractPolicy(): iam.PolicyStatement {
  return new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      "textract:StartDocumentTextDetection",
      "textract:GetDocumentTextDetection",
    ],
    resources: ["*"],
  });
}

export function metadataTableReadWritePolicy(tableArn: string): iam.PolicyStatement {
  return new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["dynamodb:GetItem", "dynamodb:BatchGetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query", "dynamodb:Scan"],
    resources: [tableArn, tableArn + "/index/*"],
  });
}

export function reviewTableReadWritePolicy(tableArn: string): iam.PolicyStatement {
  return new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
      "dynamodb:Query", "dynamodb:Scan",
    ],
    resources: [tableArn, tableArn + "/index/*"],
  });
}

export function dynamoUpdateItemPolicy(tableArn: string): iam.PolicyStatement {
  return new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["dynamodb:UpdateItem"],
    resources: [tableArn],
  });
}

export function lambdaInvokePolicy(functionArn: string): iam.PolicyStatement {
  return new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["lambda:InvokeFunction"],
    resources: [functionArn],
  });
}

export function sesSendEmailPolicy(fromAddress: string): iam.PolicyStatement {
  return new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["ses:SendEmail"],
    resources: ["*"],
    conditions: {
      StringEquals: { "ses:FromAddress": fromAddress },
    },
  });
}
