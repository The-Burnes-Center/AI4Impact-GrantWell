/**
 * Shared HTTP response builders for user-document Lambdas.
 * All responses include CORS headers and JSON-stringified bodies.
 */

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

export function success(body) {
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

export function badRequest(message) {
  return {
    statusCode: 400,
    headers: CORS_HEADERS,
    body: JSON.stringify({ message }),
  };
}

export function unauthorized(message = 'User not authenticated') {
  return {
    statusCode: 401,
    headers: CORS_HEADERS,
    body: JSON.stringify({ message }),
  };
}

export function forbidden(message) {
  return {
    statusCode: 403,
    headers: CORS_HEADERS,
    body: JSON.stringify({ message }),
  };
}

export function serverError(message = 'Internal server error') {
  return {
    statusCode: 500,
    headers: CORS_HEADERS,
    body: JSON.stringify({ message }),
  };
}
