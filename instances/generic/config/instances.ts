import type { InstanceConfig, UsState } from "grantwell-core";
import { branding } from "./branding";

const states: UsState[] = [
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "MA", name: "Massachusetts" },
  { code: "NC", name: "North Carolina" },
  { code: "RI", name: "Rhode Island" },
];

// What both live collections were created with; their tags can't change.
const collectionTags = { Environment: "DEV", Project: "GrantWell" };

export const instances: InstanceConfig[] = [
  {
    id: "generic-prod",
    instance: "generic",
    stage: "prod",
    tenancy: "multi",
    states,
    aws: {
      stackName: "grantwell-staging",
      environment: "grantwell-staging",
      cognitoDomainPrefix: "gw-auth-grantwell-staging",
      knowledgeBaseIndexName: "knowledge-base-index-grantwell-staging",
      collectionTags,
    },
    siteUrl: "https://grantwell.us",
    customDomain: {
      domainName: "grantwell.us",
      certificateArn: "arn:aws:acm:us-east-1:530075910224:certificate/a8daa5c0-d5cf-4ef8-af39-373944dc5454",
      redirectDomains: ["www.grantwell.us"],
    },
    auth: { mfaRequired: false, mfaDeadline: "2026-11-02T00:00:00-05:00" },
    email: { sender: "no-reply@grantwell.us", manageSenderIdentity: true },
    notifications: { processingQueueEmail: true },
    scraper: { dailySchedule: true },
    monitoring: { dailyBrief: true },
    seo: { indexable: true },
    tags: {},
    branding,
  },
  {
    id: "generic-dev",
    instance: "generic",
    stage: "dev",
    tenancy: "multi",
    states,
    aws: {
      stackName: "grantwell-burnes-staging",
      environment: "grantwell-burnes-staging",
      cognitoDomainPrefix: "gw-auth-grantwell-burnes-staging",
      knowledgeBaseIndexName: "knowledge-base-index-grantwell-burnes-staging",
      collectionTags,
    },
    siteUrl: "https://dghmgwzg4jiug.cloudfront.net",
    auth: { mfaRequired: false },
    email: { sender: "no-reply@grantwell.us", manageSenderIdentity: false },
    scraper: { dailySchedule: false },
    monitoring: { dailyBrief: false },
    e2e: { testEmails: ["e2e-dev@grantwell.invalid"] },
    // TEMP for v3.3.3 testing on burnes-staging; remove before release.sh prepare.
    regions: ["Region 1", "Region 2", "Region 3"],
    tags: {},
    branding,
  },
];
