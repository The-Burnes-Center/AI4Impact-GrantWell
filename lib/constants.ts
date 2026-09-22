/**
 * This file defines constants used throughout the GrantWell application.
 * These constants include configuration settings for authentication, Cognito domain name, OIDC integration name, and stack name.
 */

export const AUTHENTICATION = true;
const ENVIRONMENT = process.env.ENVIRONMENT;

// Per-environment resource names, keyed by the ENVIRONMENT env var. These must be globally unique
// per account (Cognito domains especially). To add an environment, add one row here — every derived
// name below reads from it.
interface EnvNames {
  cognitoDomainName: string;
  stackName: string;
  knowledgeBaseIndexName: string;
  deploymentUrl: string;
}

const ENV_CONFIG: Record<string, EnvNames> = {
  'grantwell-staging': {
    cognitoDomainName: 'gw-auth-grantwell-staging',
    stackName: 'grantwell-staging',
    knowledgeBaseIndexName: 'knowledge-base-index-grantwell-staging',
    deploymentUrl: 'https://grantwell.us',
  },
  'grantwell-burnes-staging': {
    cognitoDomainName: 'gw-auth-grantwell-burnes-staging',
    stackName: 'grantwell-burnes-staging',
    knowledgeBaseIndexName: 'knowledge-base-index-grantwell-burnes-staging',
    deploymentUrl: 'https://dghmgwzg4jiug.cloudfront.net',
  },
};

// No fallback — an unknown ENVIRONMENT fails loudly instead of silently deploying wrong-named resources.
const envNames = ENVIRONMENT ? ENV_CONFIG[ENVIRONMENT] : undefined;
if (!envNames) {
  throw new Error(
    `No config for ENVIRONMENT="${ENVIRONMENT ?? ''}". Expected one of: ${Object.keys(ENV_CONFIG).join(', ')}.`
  );
}

export const cognitoDomainName = envNames.cognitoDomainName;
export const stackName = envNames.stackName;
export const knowledgeBaseIndexName = envNames.knowledgeBaseIndexName;

export const OIDCIntegrationName = "";

export const MFA_REQUIRED = process.env.MFA_REQUIRED !== "false";

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
  const envDeploymentUrl = ENVIRONMENT ? ENV_CONFIG[ENVIRONMENT]?.deploymentUrl : undefined;
  if (envDeploymentUrl) {
    return { deploymentUrl: stripTrailingSlash(envDeploymentUrl) };
  }
  throw new Error(
    `No deploymentUrl for ENVIRONMENT="${ENVIRONMENT ?? ''}". Set DEPLOYMENT_URL or add one to ENV_CONFIG.`
  );
};

export const emailConfig = getEmailConfig();
