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

// Environment-specific email configuration for user invitations
const getEmailConfig = () => {
  if (ENVIRONMENT === 'production') {
    return {
      cognitoLoginUrl: 'https://gw-auth-prod.auth.us-east-1.amazoncognito.com/login',
      clientId: '4nr5drekivlcujtibu90d7uh9n',
      deploymentUrl: 'https://d1mu5xcqb0ac30.cloudfront.net/'
    };
  } else {
    return {
      cognitoLoginUrl: 'https://gw-auth-staging.auth.us-east-1.amazoncognito.com/login',
      clientId: '6fek08iq3lkn8ptqnrhul7raq8',
      deploymentUrl: 'https://d2zwf0gxpj9c8c.cloudfront.net/'
    };
  }
};

export const emailConfig = getEmailConfig();
