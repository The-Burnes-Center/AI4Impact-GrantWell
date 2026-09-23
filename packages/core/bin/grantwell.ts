#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { GrantWellStack } from '../lib/grantwell-stack';
import { stackName } from "../lib/constants"

const app = new cdk.App();

const environmentTag = process.env.ENVIRONMENT === 'production' ? 'PROD' : 'DEV';

cdk.Tags.of(app).add('Environment', environmentTag);
cdk.Tags.of(app).add('Project', 'GrantWell');

new GrantWellStack(app, stackName);

// CI only: nag findings are error annotations, which would fail `cdk deploy`.
if (process.env.CDK_NAG === 'warn') {
  cdk.Aspects.of(app).add(new AwsSolutionsChecks({ reports: true }));
}
