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
import { stackName, knowledgeBaseIndexName } from "../../constants"
import { OpenSearchStack } from "../opensearch/opensearch"

export interface KnowledgeBaseStackProps {
  readonly openSearch: OpenSearchStack,
  readonly s3bucket : s3.Bucket,
  readonly userDocumentsBucket?: s3.Bucket
}

export class KnowledgeBaseStack extends cdk.Stack {

  public readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  public readonly dataSource: bedrock.CfnDataSource;
  public readonly userDocumentsDataSource?: bedrock.CfnDataSource;

  constructor(scope: Construct, id: string, props: KnowledgeBaseStackProps) {
    super(scope, id);

    // add AOSS access to the role
    props.openSearch.knowledgeBaseRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['aoss:APIAccessAll'],
        resources: [
          `arn:aws:aoss:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:collection/${props.openSearch.openSearchCollection.attrId}`
        ]
      }
      )
    )

    // add s3 access to the role for NOFO bucket
    props.openSearch.knowledgeBaseRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [props.s3bucket.bucketArn, props.s3bucket.bucketArn + "/*"]
    }));

    // add s3 access to the role for user documents bucket (if provided)
    if (props.userDocumentsBucket) {
      props.openSearch.knowledgeBaseRole.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:*'
        ],
        resources: [props.userDocumentsBucket.bucketArn, props.userDocumentsBucket.bucketArn + "/*"]
      }));
    }

    // add bedrock access to the role
    props.openSearch.knowledgeBaseRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/amazon.titan-embed-text-v2:0`
      ]
    }
    )
    )


    const knowledgeBase = new bedrock.CfnKnowledgeBase(scope, 'KnowledgeBase', {
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

        // the properties below are optional
        opensearchServerlessConfiguration: {
          collectionArn: props.openSearch.openSearchCollection.attrArn,
          fieldMapping: {
            metadataField: 'metadata_field',
            textField: 'text_field',
            vectorField: 'vector_field',
          },
          vectorIndexName: knowledgeBaseIndexName,
        },
      },

      // the properties below are optional
      description: `Bedrock Knowledge Base for ${stackName}`,
    });

    knowledgeBase.addDependency(props.openSearch.openSearchCollection);
    knowledgeBase.node.addDependency(props.openSearch.lambdaCustomResource)

    const dataSource = new bedrock.CfnDataSource(scope, 'S3DataSource', {
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: props.s3bucket.bucketArn,
        },

      },
      knowledgeBaseId: knowledgeBase.attrKnowledgeBaseId,
      name: `${stackName}-kb-datasource`,

      // the properties below are optional      
      description: 'S3 data source',
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: 'FIXED_SIZE',

          // the properties below are optional
          fixedSizeChunkingConfiguration: {
            maxTokens: 300,
            overlapPercentage: 10,
          },
        },
      },
    });

    dataSource.addDependency(knowledgeBase);    

    // Add second data source for user documents bucket (if provided)
    let userDocumentsDataSource: bedrock.CfnDataSource | undefined;
    if (props.userDocumentsBucket) {
      userDocumentsDataSource = new bedrock.CfnDataSource(scope, 'UserDocumentsDataSource', {
        dataSourceConfiguration: {
          type: 'S3',
          s3Configuration: {
            bucketArn: props.userDocumentsBucket.bucketArn,
          },
        },
        knowledgeBaseId: knowledgeBase.attrKnowledgeBaseId,
        name: `${stackName}-kb-user-documents-datasource`,
        description: 'User uploaded documents data source',
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
      userDocumentsDataSource.addDependency(knowledgeBase);
    }

    this.knowledgeBase = knowledgeBase;
    this.dataSource = dataSource;
    this.userDocumentsDataSource = userDocumentsDataSource;
  }
}