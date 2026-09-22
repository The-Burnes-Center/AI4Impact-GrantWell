#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { GrantWellStack } from '../lib/grantwell-stack';
import { stackName } from "../lib/constants"

const app = new cdk.App();

const environmentTag = process.env.ENVIRONMENT === 'production' ? 'PROD' : 'DEV';

cdk.Tags.of(app).add('Environment', environmentTag);
cdk.Tags.of(app).add('Project', 'GrantWell');

new GrantWellStack(app, stackName);
