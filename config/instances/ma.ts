import { InstanceConfig } from "../instance-config";

export const maConfig: InstanceConfig = {
  instanceId: "ma",
  environment: "production",
  stackName: "gw-stack-prod",
  knowledgeBaseIndexName: "knowledge-base-index-prod",
  cognito: {
    cognitoDomainName: "gw-auth-prod",
    customAttributes: ["role"],
    deploymentUrl: "https://grantwell.virtualassistance.mass.gov/",
  },
  models: {
    sonnetModelId: "global.anthropic.claude-sonnet-4-6",
    haikuModelId: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
    titanModelId: "amazon.titan-embed-text-v2:0",
    useInferenceProfiles: false,
  },
  supportedStates: [],
  featureFlags: {
    stateScoping: false,
    analytics: true,
    aiGrantSearch: true,
    scraperSchedule: true,
  },
  feedbackFormUrl: "https://forms.mass.gov/eoanf/form/62/",
  gaTrackingId: "G-DY905CMNJN",
  customDomain: {
    domain: "grantwell.virtualassistance.mass.gov",
    certificateArn:
      "arn:aws:acm:us-east-1:976046823671:certificate/031d0d18-cdca-4d2e-9be1-259b838d3baf",
  },
};
