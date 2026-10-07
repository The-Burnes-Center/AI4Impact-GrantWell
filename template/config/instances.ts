import type { InstanceConfig, UsState } from "grantwell-core";
import { branding } from "./branding";

const state: UsState = { code: "XX", name: "Example State" };

// One entry per deployment; `ENVIRONMENT=<aws.environment>` picks which one a deploy uses.
// Each deployment lives in its own AWS account: staging in one, prod in another.
// The aws names become physical AWS resource names: pick them once and never change them.
export const instances: InstanceConfig[] = [
  {
    id: "example-staging",
    instance: "example",
    stage: "dev",
    tenancy: "single",
    states: [state],
    aws: {
      stackName: "grantwell-example-staging",
      environment: "grantwell-example-staging",
      cognitoDomainPrefix: "gw-auth-grantwell-example-staging",
      knowledgeBaseIndexName: "knowledge-base-index-grantwell-example-staging",
    },
    siteUrl: "https://staging.grants.example.gov",
    customDomain: {
      domainName: "staging.grants.example.gov",
      certificateArn: "arn:aws:acm:us-east-1:111111111111:certificate/replace-me",
    },
    auth: { mfaRequired: true },
    email: { sender: "no-reply@staging.grants.example.gov", manageSenderIdentity: true },
    scraper: { dailySchedule: false },
    monitoring: { dailyBrief: false },
    tags: {},
    branding,
  },
  {
    id: "example-prod",
    instance: "example",
    stage: "prod",
    tenancy: "single",
    states: [state],
    aws: {
      stackName: "grantwell-example",
      environment: "grantwell-example",
      cognitoDomainPrefix: "gw-auth-grantwell-example",
      knowledgeBaseIndexName: "knowledge-base-index-grantwell-example",
    },
    siteUrl: "https://grants.example.gov",
    customDomain: {
      domainName: "grants.example.gov",
      certificateArn: "arn:aws:acm:us-east-1:000000000000:certificate/replace-me",
    },
    auth: { mfaRequired: true },
    email: { sender: "no-reply@grants.example.gov", manageSenderIdentity: true },
    scraper: { dailySchedule: true },
    monitoring: { dailyBrief: true },
    tags: {},
    branding,
  },
];
