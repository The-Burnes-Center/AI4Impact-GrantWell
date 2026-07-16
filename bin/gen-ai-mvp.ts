#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { GenAiMvpStack } from '../lib/gen-ai-mvp-stack';
import { stackName } from "../lib/constants"
import { resolveInstanceInfra } from "../lib/shared/instance-infra";

const app = new cdk.App();

const environmentTag = process.env.ENVIRONMENT === 'production' ? 'PROD' : 'DEV';

cdk.Tags.of(app).add('Environment', environmentTag);
cdk.Tags.of(app).add('Project', 'GrantWell');

// A config-driven instance binds the stack to its own account/region; without one (MA/generic
// today) the stack stays environment-agnostic, exactly as before.
const infraAws = resolveInstanceInfra()?.aws;

new GenAiMvpStack(app, stackName, {
  env: infraAws?.account
    ? { account: infraAws.account, region: infraAws.region }
    : undefined,
});