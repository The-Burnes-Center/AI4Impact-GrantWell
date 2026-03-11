/**
 * Shared authentication utilities for user-document Lambdas.
 * Extracts and validates userId from Cognito JWT claims.
 *
 * Required: API Gateway HTTP API with JWT authorizer.
 */

export function extractUserId(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims) return null;
  return claims['cognito:username'] || claims.username || null;
}
