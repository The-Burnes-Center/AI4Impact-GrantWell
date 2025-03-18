/**
 * This file defines constants used throughout the Gen AI MVP application.
 * These constants include configuration settings for authentication, Cognito domain name, OIDC integration name, and stack name.
 */

export const AUTHENTICATION = true;

// Change these as needed
// Must be unique globally or the deployment will fail
export const cognitoDomainName = "gw-auth";

// This can be anything that would be understood easily, but you must use the same name
// when setting up a sign-in provider in Cognito
// Make sure to leave it blank if you do not actually have an SSO provider configured in Cognito!
export const OIDCIntegrationName = "";

// This MUST be unique to your account and is case sensitive
export const stackName = "gw-stack";
