import type { InstanceConfig, UsState } from "grantwell-core";
import { branding } from "./branding";

const states: UsState[] = [
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "MA", name: "Massachusetts" },
  { code: "NC", name: "North Carolina" },
  { code: "RI", name: "Rhode Island" },
];

// Environment=DEV on prod too: that is what the live stacks carry.
const tags = { Environment: "DEV", Project: "GrantWell" };

export const instances: InstanceConfig[] = [
  {
    id: "generic-prod",
    stage: "prod",
    tenancy: "multi",
    states,
    aws: {
      stackName: "grantwell-staging",
      environment: "grantwell-staging",
      cognitoDomainPrefix: "gw-auth-grantwell-staging",
      knowledgeBaseIndexName: "knowledge-base-index-grantwell-staging",
    },
    siteUrl: "https://grantwell.us",
    customDomain: {
      domainName: "grantwell.us",
      certificateArn: "arn:aws:acm:us-east-1:530075910224:certificate/64ed4829-92a8-45a5-900d-454e50e25bdf",
    },
    auth: { mfaRequired: false },
    email: { sender: "no-reply@grantwell.us", manageSenderIdentity: true },
    scraper: { dailySchedule: true },
    monitoring: { dailyBrief: true },
    tags,
    branding,
  },
  {
    id: "generic-dev",
    stage: "dev",
    tenancy: "multi",
    states,
    aws: {
      stackName: "grantwell-burnes-staging",
      environment: "grantwell-burnes-staging",
      cognitoDomainPrefix: "gw-auth-grantwell-burnes-staging",
      knowledgeBaseIndexName: "knowledge-base-index-grantwell-burnes-staging",
    },
    siteUrl: "https://dghmgwzg4jiug.cloudfront.net",
    auth: { mfaRequired: false },
    email: { sender: "no-reply@grantwell.us", manageSenderIdentity: false },
    scraper: { dailySchedule: false },
    monitoring: { dailyBrief: false },
    tags,
    branding,
  },
];
