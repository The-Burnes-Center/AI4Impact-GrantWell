/**
 * This file defines the OpenSearchStack class, which sets up an OpenSearch Serverless collection and related resources using AWS CDK.
 * It includes creating the collection, security policies, IAM roles, and a Lambda function to create an index in the collection.
 */

import * as cdk from 'aws-cdk-lib';
import * as crypto from 'crypto';
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from "constructs";
import { aws_opensearchserverless as opensearchserverless } from 'aws-cdk-lib';
import { stackName, knowledgeBaseIndexName } from "../../constants";

type OssPolicyNames = { enc: string; network: string; access: string };

const LIVE_OSS_POLICY_NAMES: Record<string, OssPolicyNames> = {
  'grantwell-staging': {
    enc: 'grantwell--oss-enc-policy',
    network: 'grantwell--oss-network-policy',
    access: 'grantwell--oss-access-policy',
  },
  'grantwell-burnes-staging': {
    enc: 'grantwell-burnes-staging-oss-enc',
    network: 'grantwell-burnes-staging-oss-net',
    access: 'grantwell-burnes-staging-oss-acc',
  },
};

function ossPolicyNamesFor(name: string): OssPolicyNames {
  const lower = name.toLowerCase();
  const live = LIVE_OSS_POLICY_NAMES[lower];
  if (live) return live;
  const head = lower.replace(/[^a-z0-9]/g, '').slice(0, 5);
  const hash = crypto.createHash('sha256').update(lower).digest('hex').slice(0, 5);
  const prefix = `${head}-${hash}`;
  return {
    enc: `${prefix}-oss-enc-policy`,
    network: `${prefix}-oss-network-policy`,
    access: `${prefix}-oss-access-policy`,
  };
}

export interface OpenSearchStackProps {}

export class OpenSearchStack extends cdk.Stack {
  public readonly openSearchCollection: opensearchserverless.CfnCollection;
  public readonly collectionName: string;
  public readonly knowledgeBaseRole: iam.Role;
  public readonly lambdaCustomResource: cdk.CustomResource;

  constructor(scope: Construct, id: string, _props: OpenSearchStackProps) {
    super(scope, id);

    this.collectionName = `${stackName.toLowerCase()}-oss-collection`;
    const openSearchCollection = new opensearchserverless.CfnCollection(scope, 'OpenSearchCollection', {
      name: this.collectionName,
      description: `OpenSearch Serverless Collection for ${stackName}`,
      standbyReplicas: 'DISABLED',
      type: 'VECTORSEARCH',
    });

    // Per-stack, collision-free policy names. See ossPolicyNamesFor: live stacks pinned to their
    // exact deployed names so existing policies aren't renamed; new stacks get a unique scheme.
    const ossPolicyNames = ossPolicyNamesFor(stackName);

    // Create encryption policy first
    const encPolicy = new opensearchserverless.CfnSecurityPolicy(scope, 'OSSEncryptionPolicy', {
      name: ossPolicyNames.enc,
      policy: `{"Rules":[{"ResourceType":"collection","Resource":["collection/${this.collectionName}"]}],"AWSOwnedKey":true}`,
      type: 'encryption',
    });

    // Also network policy
    const networkPolicy = new opensearchserverless.CfnSecurityPolicy(scope, "OSSNetworkPolicy", {
      name: ossPolicyNames.network,
      type: "network",
      policy: `[{"Rules":[{"ResourceType":"dashboard","Resource":["collection/${this.collectionName}"]},{"ResourceType":"collection","Resource":["collection/${this.collectionName}"]}],"AllowFromPublic":true}]`,
    });

    const indexFunctionRole = new iam.Role(scope, 'IndexFunctionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
      ],
    });

    const knowledgeBaseRole = new iam.Role(scope, "KnowledgeBaseRole", {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
    });

    this.knowledgeBaseRole = knowledgeBaseRole;

    const accessPolicy = new opensearchserverless.CfnAccessPolicy(scope, "OSSAccessPolicy", {
      name: ossPolicyNames.access,
      type: "data",
      policy: JSON.stringify([
        {
          "Rules": [
            {
              "ResourceType": "index",
              "Resource": [
                `index/${this.collectionName}/*`,
              ],
              "Permission": [
                "aoss:UpdateIndex",
                "aoss:DescribeIndex",
                "aoss:ReadDocument",
                "aoss:WriteDocument",
                "aoss:CreateIndex",
              ],
            },
            {
              "ResourceType": "collection",
              "Resource": [
                `collection/${this.collectionName}`,
              ],
              "Permission": [
                "aoss:DescribeCollectionItems",
                "aoss:CreateCollectionItems",
                "aoss:UpdateCollectionItems",
              ],
            },
          ],
          "Principal": [indexFunctionRole.roleArn, new iam.AccountPrincipal(this.account).arn, knowledgeBaseRole.roleArn],
        },
      ]),
    });

    openSearchCollection.addDependency(encPolicy);
    openSearchCollection.addDependency(networkPolicy);
    openSearchCollection.addDependency(accessPolicy);

    this.openSearchCollection = openSearchCollection;

    const openSearchCreateIndexFunction = new lambda.Function(scope, 'OpenSearchCreateIndexFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(path.join(__dirname, 'create-index-lambda'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output',
          ],
        },
      }),
      handler: 'lambda_function.lambda_handler',
      role: indexFunctionRole,
      environment: {
        COLLECTION_ENDPOINT: `${openSearchCollection.attrId}.${cdk.Stack.of(this).region}.aoss.amazonaws.com`,
        INDEX_NAME: knowledgeBaseIndexName,
        EMBEDDING_DIM: "1024",
        REGION: cdk.Stack.of(this).region,
      },
      timeout: cdk.Duration.seconds(120),
    });

    indexFunctionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'aoss:*',
      ],
      resources: [`arn:aws:aoss:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:collection/${openSearchCollection.attrId}`],
    }));

    const lambdaProvider = new cr.Provider(scope, "CreateIndexFunctionCustomProvider", {
      onEventHandler: openSearchCreateIndexFunction,
    });

    const lambdaCustomResource = new cdk.CustomResource(scope, "CreateIndexFunctionCustomResource", {
      serviceToken: lambdaProvider.serviceToken,
    });

    this.lambdaCustomResource = lambdaCustomResource;
  }
}