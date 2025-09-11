/**
 * This file defines constants used throughout the Gen AI MVP application.
 * These constants include configuration settings for authentication, Cognito domain name, OIDC integration name, and stack name.
 */

export const AUTHENTICATION = true;

// Change these as needed
// Must be unique globally or the deployment will fail
// Environment-specific domain names for branch-based deployment
const getCognitoDomainName = () => {
  const environment = process.env.ENVIRONMENT;
  
  if (environment === 'production') {
    return 'gw-auth-prod';
  } else if (environment === 'staging') {
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
  // Check for environment variable set by GitHub Actions
  const environment = process.env.ENVIRONMENT;
  
  if (environment === 'production') {
    return 'gw-stack-prod';
  } else if (environment === 'staging') {
    return 'gw-stack-staging';
  }
  
  // Fallback for local development
  return 'gw-stack-dev';
};

export const stackName = getStackName();
