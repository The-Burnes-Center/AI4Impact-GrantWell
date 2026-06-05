export type CognitoCustomAttribute = "role" | "state";

export interface CognitoConfig {
  cognitoDomainName: string;
  customAttributes: CognitoCustomAttribute[];
  deploymentUrl: string;
}

export interface ModelsConfig {
  sonnetModelId: string;
  haikuModelId: string;
  titanModelId: string;
  useInferenceProfiles: boolean;
}

export interface FeatureFlags {
  stateScoping: boolean;
  analytics: boolean;
  aiGrantSearch: boolean;
  scraperSchedule: boolean;
}

export interface CustomDomainConfig {
  domain?: string;
  certificateArn?: string;
}

export interface InstanceConfig {
  instanceId: string;
  environment: string;
  stackName: string;
  knowledgeBaseIndexName: string;
  cognito: CognitoConfig;
  models: ModelsConfig;
  supportedStates: string[];
  featureFlags: FeatureFlags;
  feedbackFormUrl: string;
  gaTrackingId: string;
  customDomain: CustomDomainConfig;
  grantsGovApiKey?: string;
}
