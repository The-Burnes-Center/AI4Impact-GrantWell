/**
 * This file defines constants used throughout the Gen AI MVP application.
 * These constants include configuration settings for authentication, Cognito domain name, OIDC integration name, and stack name.
 */

export const AUTHENTICATION = true;
const ENVIRONMENT = process.env.ENVIRONMENT;

// Change these as needed
// Must be unique globally or the deployment will fail
// Environment-specific domain names for branch-based deployment
const getCognitoDomainName = () => {
  
  if (ENVIRONMENT === 'production') {
    return 'gw-auth-prod';
  } else if (ENVIRONMENT === 'staging') {
    return 'gw-auth-staging';
  }
  
  // Fallback for local development
  return 'gw-auth-dev';
};

export const cognitoDomainName = getCognitoDomainName();

// This can be anything that would be understood easily, but you must use the same name
// when setting up a sign-in provider in Cognito
// Make sure to leave it blank if you do not actually have an SSO provider configured in Cognito!
export const OIDCIntegrationName = "";

// This MUST be unique to your account and is case sensitive
// Environment-specific stack names for branch-based deployment
const getStackName = () => {
  if (ENVIRONMENT === 'production') {
    return 'gw-stack-prod';
  } else if (ENVIRONMENT === 'staging') {
    return 'gw-stack-staging';
  }
  
  // Fallback for local development
  return 'gw-stack-dev';
};

export const stackName = getStackName();

// Environment-specific OpenSearch index name for Knowledge Base
const getKnowledgeBaseIndexName = () => {
  if (ENVIRONMENT === 'production') {
    return 'knowledge-base-index-prod';
  } else if (ENVIRONMENT === 'staging') {
    return 'knowledge-base-index-staging';
  }
  
  // Fallback for local development
  return 'knowledge-base-index-dev';
};

export const knowledgeBaseIndexName = getKnowledgeBaseIndexName();

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

// Environment-specific email configuration for user invitations
const getEmailConfig = () => {
  const customDomain = customDomainConfig.domain;
  
  if (customDomain) {
    return {
      deploymentUrl: `https://${customDomain}/`
    };
  }
  
  // Fallback to CloudFront domains if custom domain not configured
  if (ENVIRONMENT === 'production') {
    return {
      deploymentUrl: 'https://d1mu5xcqb0ac30.cloudfront.net/'
    };
  } else {
    return {
      deploymentUrl: 'https://d2zwf0gxpj9c8c.cloudfront.net/'
    };
  }
};

export const emailConfig = getEmailConfig();
