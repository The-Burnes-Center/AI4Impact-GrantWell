/**
 * CloudFront Function (viewer request) for the site's default behavior: app routes get
 * /index.html, real files pass through, so a missing file is a real 404. App routes can carry
 * NOFO titles with dots (/requirements/U.S.%20Grants), so files are matched by prefix, not by
 * extension.
 */
export const SPA_ROUTING_CODE = `function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.indexOf('/assets/') === 0 || uri.indexOf('/images/') === 0 ||
      uri.indexOf('/.well-known/') === 0 || /^\\/[^\\/]*\\.[^\\/]*$/.test(uri)) {
    return request;
  }
  request.uri = '/index.html';
  return request;
}
`;
