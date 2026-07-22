/**
 * This file defines constants used throughout the Gen AI MVP application.
 * These constants include configuration settings for authentication, Cognito domain name, OIDC integration name, and stack name.
 */

import { resolveInstanceInfra } from "./shared/instance-infra";

export const AUTHENTICATION = true;
const ENVIRONMENT = process.env.ENVIRONMENT;

// When GRANTWELL_INSTANCE names a config-driven instance, its infra config wins; otherwise the
// ENVIRONMENT switch below runs unchanged (so MA/generic deploys are byte-identical).
const instanceInfra = resolveInstanceInfra();

// Per-environment resource names, keyed by the ENVIRONMENT env var. These must be globally unique
// per account (Cognito domains especially). To add an environment, add one row here — every derived
// name below reads from it. A config-driven GRANTWELL_INSTANCE overrides this map entirely.
interface EnvNames {
  cognitoDomainName: string;
  stackName: string;
  knowledgeBaseIndexName: string;
}

const ENV_CONFIG: Record<string, EnvNames> = {
  'grantwell-staging': {
    cognitoDomainName: 'gw-auth-grantwell-staging',
    stackName: 'grantwell-staging',
    knowledgeBaseIndexName: 'knowledge-base-index-grantwell-staging',
  },
  'grantwell-burnes-staging': {
    cognitoDomainName: 'gw-auth-grantwell-burnes-staging',
    stackName: 'grantwell-burnes-staging',
    knowledgeBaseIndexName: 'knowledge-base-index-grantwell-burnes-staging',
  },
};

// A config-driven instance (GRANTWELL_INSTANCE) wins; otherwise resolve by ENVIRONMENT. There is no
// fallback — an unknown ENVIRONMENT fails loudly instead of silently deploying wrong-named resources.
const envNames = instanceInfra ?? (ENVIRONMENT ? ENV_CONFIG[ENVIRONMENT] : undefined);
if (!envNames) {
  throw new Error(
    `No config for ENVIRONMENT="${ENVIRONMENT ?? ''}". Expected one of: ${Object.keys(ENV_CONFIG).join(', ')} (or set GRANTWELL_INSTANCE).`
  );
}

export const cognitoDomainName = envNames.cognitoDomainName;
export const stackName = envNames.stackName;
export const knowledgeBaseIndexName = envNames.knowledgeBaseIndexName;

// This can be anything that would be understood easily, but you must use the same name
// when setting up a sign-in provider in Cognito
// Make sure to leave it blank if you do not actually have an SSO provider configured in Cognito!
export const OIDCIntegrationName = "";

// Environment-specific custom domain configuration for CloudFront
const getCustomDomainConfig = () => {
  // Custom domain can be provided via environment variable, or use defaults
  const customDomain = process.env.CLOUDFRONT_CUSTOM_DOMAIN;
  const certificateArn = process.env.CLOUDFRONT_CERTIFICATE_ARN;
  
  // If both are explicitly provided via env vars, use them (for any environment)
  if (customDomain && certificateArn) {
    return {
      domain: customDomain,
      certificateArn: certificateArn
    };
  }
  
  // Staging and local development: Always use CloudFront domain (no custom domain)
  return {
    domain: undefined,
    certificateArn: undefined
  };
};

export const customDomainConfig = getCustomDomainConfig();

const getEmailConfig = () => {
  const stripTrailingSlash = (url: string) => url.replace(/\/+$/, "");

  const customDomain = customDomainConfig.domain;
  if (customDomain) {
    return { deploymentUrl: stripTrailingSlash(`https://${customDomain}`) };
  }

  const deploymentUrl = process.env.DEPLOYMENT_URL;
  if (deploymentUrl) {
    return { deploymentUrl: stripTrailingSlash(deploymentUrl) };
  }
  if (instanceInfra?.deploymentUrl) {
    return { deploymentUrl: stripTrailingSlash(instanceInfra.deploymentUrl) };
  }
  return { deploymentUrl: 'https://d2zwf0gxpj9c8c.cloudfront.net' };
};

export const emailConfig = getEmailConfig();
