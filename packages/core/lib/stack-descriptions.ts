import * as cdk from 'aws-cdk-lib';
import { IConstruct } from 'constructs';
import { InstanceConfig } from './config/instance-config';

// Keyed by construct ID. The four "empty" stacks are construct scopes whose resources deploy in
// the root stack; CDK never deploys them.
const PURPOSE: Record<string, string> = {
  TableStack: 'DynamoDB tables',
  BucketStack: 'empty, its S3 buckets deploy in the root stack',
  OpenSearchStack: 'empty, its OpenSearch Serverless collection deploys in the root stack',
  KnowledgeBaseStack: 'empty, its Bedrock knowledge base deploys in the root stack',
  LambdaFunctions: 'empty, its Lambda functions deploy in the root stack and nested stacks',
  NofoPipelineStack: 'NOFO processing pipeline (Step Functions, queue dispatcher, admin review)',
  DraftGenerationStack: 'draft generation pipeline (Step Functions)',
  ScraperStack: 'Grants.gov scraper and NOFO lifecycle jobs',
  DocumentConversionStack: 'document conversion (HTML/DOCX to and from PDF)',
  NotificationsStack: 'NOFO notification digest email',
  MonitoringStack: 'alarms, alert formatter and daily health brief',
};

/** Sets a readable template Description on the root stack and every stack under it. */
export function describeStacks(root: cdk.Stack, config: InstanceConfig): void {
  const label = `GrantWell ${config.id} (${config.stage})`;
  root.templateOptions.description = `${label}: web app, auth and APIs`;
  const stacks = root.node.findAll().filter((c: IConstruct): c is cdk.Stack => c !== root && cdk.Stack.isStack(c));
  for (const stack of stacks) {
    const purpose = PURPOSE[stack.node.id];
    if (!purpose) throw new Error(`No description for stack ${stack.node.path}; add it to lib/stack-descriptions.ts`);
    stack.templateOptions.description = `${label}: ${purpose}`;
  }
}
