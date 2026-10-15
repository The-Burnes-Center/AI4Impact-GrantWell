/**
 * Every <Route> path in the UI router (packages/ui/src/App.tsx and components/AppConfigured.tsx),
 * minus the "*" catch-all. `:name` matches one non-empty segment. test/ui-contract.test.ts fails
 * when this list and the UI's routes drift apart.
 */
export const APP_ROUTES = [
  "/",
  "/login",
  "/home",
  "/whats-new",
  "/profile",
  "/admin",
  "/admin/dashboard",
  "/chat/sessions",
  "/chat/:sessionId",
  "/document-editor",
  "/document-editor/drafts",
  "/document-editor/:sessionId",
  "/requirements/:documentIdentifier",
] as const;

/**
 * CloudFront Function (viewer request) for the site's default behavior: app routes get
 * /index.html (/whats-new gets its pre-rendered /whats-new.html); everything else goes to the
 * bucket as a file request, so a missing file or unknown page is a real 404 with /404.html.
 * App routes can carry grant titles with dots (/requirements/U.S.%20Grants), so files are matched
 * by prefix, not by extension, and routes match case-insensitively with one optional trailing
 * slash, as the UI router does.
 */
export const SPA_ROUTING_CODE = `var ROUTES = ${JSON.stringify(APP_ROUTES.map((r) => r.split("/")))};
function isAppRoute(uri) {
  var parts = uri.toLowerCase().split('/');
  if (parts.length > 2 && parts[parts.length - 1] === '') parts.pop();
  for (var i = 0; i < ROUTES.length; i++) {
    var route = ROUTES[i];
    if (route.length !== parts.length) continue;
    var j = 1;
    while (j < route.length && (route[j] === parts[j] || (route[j].charAt(0) === ':' && parts[j] !== ''))) j++;
    if (j === route.length) return true;
  }
  return false;
}
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.indexOf('/assets/') === 0 || uri.indexOf('/images/') === 0 ||
      uri.indexOf('/.well-known/') === 0 || /^\\/[^\\/]*\\.[^\\/]*$/.test(uri)) {
    return request;
  }
  if (uri === '/whats-new' || uri === '/whats-new/') {
    request.uri = '/whats-new.html';
  } else if (isAppRoute(uri)) {
    request.uri = '/index.html';
  }
  return request;
}
`;
