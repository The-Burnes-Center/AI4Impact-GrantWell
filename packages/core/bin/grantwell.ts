#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { GrantWellStack } from '../lib/grantwell-stack';
import { validateInstanceConfig } from '../lib/config/instance-config';
import { instances } from './instances';

const environment = process.env.ENVIRONMENT;
const config = instances.find((i) => i.aws.environment === environment);
if (!config) {
  throw new Error(
    `No instance config for ENVIRONMENT="${environment ?? ''}". Expected one of: ${instances.map((i) => i.aws.environment).join(', ')}.`
  );
}
validateInstanceConfig(config);

const app = new cdk.App();

for (const [key, value] of Object.entries(config.tags)) {
  cdk.Tags.of(app).add(key, value);
}

new GrantWellStack(app, config.aws.stackName, { config });

// CI only: nag findings are error annotations, which would fail `cdk deploy`.
if (process.env.CDK_NAG === 'warn') {
  cdk.Aspects.of(app).add(new AwsSolutionsChecks({ reports: true }));
}
