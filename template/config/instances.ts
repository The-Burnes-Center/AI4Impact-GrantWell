import type { InstanceConfig } from "grantwell-core";
import { branding } from "./branding";

// One entry per deployment; `ENVIRONMENT=<aws.environment>` picks which one a deploy uses.
// The aws names become physical AWS resource names: pick them once and never change them.
export const instances: InstanceConfig[] = [
  {
    id: "example-prod",
    stage: "prod",
    tenancy: "single",
    states: [{ code: "XX", name: "Example State" }],
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
    tags: { Project: "GrantWell" },
    branding,
  },
];
