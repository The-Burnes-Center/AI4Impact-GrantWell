/**
 * This file defines a construct for creating and configuring a Bedrock Knowledge Base using AWS CDK.
 * The Knowledge Base is configured with OpenSearch Serverless for storage and an S3 bucket as a data source.
 * This construct sets up the necessary IAM roles and permissions, and configures the Knowledge Base and data source.
 */

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { aws_bedrock as bedrock } from 'aws-cdk-lib';
import { Construct } from "constructs";
import { stackName } from "../../constants";
import { OpenSearchStack } from "../opensearch/opensearch";

export interface KnowledgeBaseStackProps {
  readonly openSearch: OpenSearchStack;
  readonly s3bucket: s3.Bucket;
}

export class KnowledgeBaseStack extends cdk.Stack {
  public readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  public readonly dataSource: bedrock.CfnDataSource;

  constructor(scope: Construct, id: string, props: KnowledgeBaseStackProps) {
    super(scope, id);

    // Add AOSS access to the role
    props.openSearch.knowledgeBaseRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['aoss:APIAccessAll'],
        resources: [
          `arn:aws:aoss:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:collection/${props.openSearch.openSearchCollection.attrId}`
        ]
      })
    );

    // Add S3 access to the role
    props.openSearch.knowledgeBaseRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:*'],
        resources: [props.s3bucket.bucketArn, `${props.s3bucket.bucketArn}/*`]
      })
    );

    // Add Bedrock access to the role
    props.openSearch.knowledgeBaseRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/amazon.titan-embed-text-v2:0`
        ]
      })
    );

    // Create the Bedrock Knowledge Base
    const knowledgeBase = new bedrock.CfnKnowledgeBase(this, 'KnowledgeBase', {
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/amazon.titan-embed-text-v2:0`,
        },
      },
      name: `${stackName}-kb`,
      roleArn: props.openSearch.knowledgeBaseRole.roleArn,
      storageConfiguration: {
        type: 'OPENSEARCH_SERVERLESS',
        opensearchServerlessConfiguration: {
          collectionArn: props.openSearch.openSearchCollection.attrArn,
          fieldMapping: {
            metadataField: 'metadata_field',
            textField: 'text_field',
            vectorField: 'vector_field',
          },
          vectorIndexName: 'knowledge-base-index',
        },
      },
      description: `Bedrock Knowledge Base for ${stackName}`,
    });

    knowledgeBase.addDependency(props.openSearch.openSearchCollection);
    knowledgeBase.node.addDependency(props.openSearch.lambdaCustomResource);

    // Create the S3 Data Source
    const dataSource = new bedrock.CfnDataSource(this, 'S3DataSource', {
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: props.s3bucket.bucketArn,
        },
      },
      knowledgeBaseId: knowledgeBase.attrKnowledgeBaseId,
      name: `${stackName}-kb-datasource`,
      description: 'S3 data source',
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: 'FIXED_SIZE',
          fixedSizeChunkingConfiguration: {
            maxTokens: 300,
            overlapPercentage: 10,
          },
        },
      },
    });

    dataSource.addDependency(knowledgeBase);

    this.knowledgeBase = knowledgeBase;
    this.dataSource = dataSource;
  }
}