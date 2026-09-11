/**
 * Nested stack holding the document-conversion Lambda functions (HTML/DOCX <-> PDF)
 * and the layers used only by them. Split out of the main app stack to stay under
 * the 500-resource CloudFormation limit.
 */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import { Table } from "aws-cdk-lib/aws-dynamodb";

import {
  s3ListBucketPolicy,
  s3ObjectReadWriteDeletePolicy,
} from "./shared-policies";

export interface DocumentConversionStackProps extends cdk.NestedStackProps {
  readonly ffioNofosBucket: s3.Bucket;
  readonly analyticsTable: Table;
  /** Shared with functions outside this stack, so it stays in the parent. */
  readonly jsSharedLayer: lambda.ILayerVersion;
}

export class DocumentConversionStack extends cdk.NestedStack {
  public readonly htmlToPdfConverterFunction: lambda.Function;
  public readonly applicationPdfGeneratorFunction: lambda.Function;
  public readonly docxToTextConverterFunction: lambda.Function;
  public readonly applicationDocxGeneratorFunction: lambda.Function;

  constructor(
    scope: Construct,
    id: string,
    props: DocumentConversionStackProps
  ) {
    super(scope, id, props);

    // Create Puppeteer Core Lambda Layer for HTML to PDF conversion
    // Note: @sparticuz/chromium v131+ bundles all required dependencies, so no separate Chromium layer is needed
    const puppeteerCoreLayer = new lambda.LayerVersion(
      this,
      "PuppeteerCoreLayer",
      {
        layerVersionName: "PuppeteerCoreLayer",
        compatibleRuntimes: [lambda.Runtime.NODEJS_24_X],
        code: lambda.Code.fromAsset(
          path.join(__dirname, "layers/puppeteer-core-layer.zip")
        ),
        description: "Puppeteer Core and dependencies for Lambda",
      }
    );

    // Add HTML to PDF converter Lambda function
    const htmlToPdfConverterFunction = new lambda.Function(
      this,
      "HtmlToPdfConverterFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "landing-page/html-to-pdf-converter")),
        handler: "index.handler",
        layers: [puppeteerCoreLayer],
        environment: {
          BUCKET: props.ffioNofosBucket.bucketName,
        },
        timeout: cdk.Duration.minutes(5),
        memorySize: 1024, // PDF conversion with Chromium can be memory-intensive
      }
    );

    // S3 permissions for HTML to PDF converter
    // ListBucket permission on the bucket itself
    htmlToPdfConverterFunction.addToRolePolicy(
      s3ListBucketPolicy(props.ffioNofosBucket.bucketArn)
    );
    // Object-level permissions on bucket contents
    htmlToPdfConverterFunction.addToRolePolicy(
      s3ObjectReadWriteDeletePolicy(props.ffioNofosBucket.bucketArn)
    );

    // Add S3 event notification to trigger HTML-to-PDF conversion
    props.ffioNofosBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(htmlToPdfConverterFunction),
      {
        prefix: "pending-conversion/",
        suffix: ".html",
      }
    );

    this.htmlToPdfConverterFunction = htmlToPdfConverterFunction;

    // Application PDF Generator Lambda Function (using Puppeteer for tagged PDFs)
    const applicationPdfGeneratorFunction = new lambda.Function(
      this,
      "ApplicationPdfGeneratorFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "application-pdf-generator")
        ),
        handler: "index.handler",
        layers: [puppeteerCoreLayer, props.jsSharedLayer],
        environment: {
          ANALYTICS_TABLE_NAME: props.analyticsTable.tableName,
        },
        timeout: cdk.Duration.minutes(5),
        memorySize: 2048, // PDF conversion with Chromium can be memory-intensive
      }
    );
    props.analyticsTable.grantWriteData(applicationPdfGeneratorFunction);

    this.applicationPdfGeneratorFunction = applicationPdfGeneratorFunction;

    // --- DOCX Support ---

    // Lambda Layer: mammoth (DOCX text extraction, pure JS)
    const mammothLayer = new lambda.LayerVersion(this, "MammothLayer", {
      layerVersionName: "MammothLayer",
      compatibleRuntimes: [lambda.Runtime.NODEJS_24_X],
      code: lambda.Code.fromAsset(
        path.join(__dirname, "layers/mammoth-layer.zip")
      ),
      description: "mammoth library for DOCX text extraction",
    });

    // Lambda Layer: html-to-docx (HTML → DOCX conversion)
    const htmlToDocxLayer = new lambda.LayerVersion(this, "HtmlToDocxLayer", {
      layerVersionName: "HtmlToDocxLayer",
      compatibleRuntimes: [lambda.Runtime.NODEJS_24_X],
      code: lambda.Code.fromAsset(
        path.join(__dirname, "layers/html-to-docx-layer.zip")
      ),
      description: "html-to-docx library for generating Word documents",
    });

    // DOCX to Text Converter — triggered by S3 NOFO-File-DOCX uploads
    const docxToTextConverterFunction = new lambda.Function(
      this,
      "DocxToTextConverterFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "nofo-pipeline/docx-to-text-converter")
        ),
        handler: "index.handler",
        layers: [mammothLayer],
        timeout: cdk.Duration.minutes(2),
        memorySize: 512,
      }
    );

    // S3 permissions for DOCX converter
    docxToTextConverterFunction.addToRolePolicy(
      s3ListBucketPolicy(props.ffioNofosBucket.bucketArn)
    );
    docxToTextConverterFunction.addToRolePolicy(
      s3ObjectReadWriteDeletePolicy(props.ffioNofosBucket.bucketArn)
    );

    // S3 event: NOFO-File-DOCX upload → docx-to-text-converter Lambda
    props.ffioNofosBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(docxToTextConverterFunction),
      { suffix: "NOFO-File-DOCX" }
    );

    this.docxToTextConverterFunction = docxToTextConverterFunction;

    // Application DOCX Generator — REST API endpoint for draft export
    const applicationDocxGeneratorFunction = new lambda.Function(
      this,
      "ApplicationDocxGeneratorFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "application-docx-generator")
        ),
        handler: "index.handler",
        layers: [htmlToDocxLayer, props.jsSharedLayer],
        environment: {
          ANALYTICS_TABLE_NAME: props.analyticsTable.tableName,
        },
        timeout: cdk.Duration.minutes(2),
        memorySize: 512,
      }
    );
    props.analyticsTable.grantWriteData(applicationDocxGeneratorFunction);

    this.applicationDocxGeneratorFunction = applicationDocxGeneratorFunction;
  }
}
