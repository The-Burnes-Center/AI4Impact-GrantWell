import { InstanceConfig } from "../instance-config";

export const genericConfig: InstanceConfig = {
  instanceId: "generic",
  environment: "grantwell-staging",
  stackName: "grantwell-staging",
  knowledgeBaseIndexName: "knowledge-base-index-grantwell-staging",
  cognito: {
    cognitoDomainName: "gw-auth-grantwell-staging",
    customAttributes: ["role", "state"],
    deploymentUrl: "https://grantwell.us/",
  },
  models: {
    sonnetModelId: "global.anthropic.claude-sonnet-4-6",
    haikuModelId: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    titanModelId: "amazon.titan-embed-text-v2:0",
    useInferenceProfiles: true,
  },
  supportedStates: ["CA", "CO", "MA", "RI"],
  featureFlags: {
    stateScoping: true,
    analytics: true,
    aiGrantSearch: true,
    scraperSchedule: false,
  },
  feedbackFormUrl: "",
  // index.html uses G-1CVKPYK2GD, App.tsx uses G-K27MB9Y26C — reconcile in Phase 3 FE wiring
  gaTrackingId: "G-1CVKPYK2GD",
  customDomain: {
    domain: "grantwell.us",
    certificateArn:
      "arn:aws:acm:us-east-1:530075910224:certificate/64ed4829-92a8-45a5-900d-454e50e25bdf",
  },
};
