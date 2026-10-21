/**
 * Attachment downloads from agency hosts we don't control.
 *
 * Uses node:http/https instead of fetch because fetch decodes any Brotli body a server sends,
 * whatever we ask for, and Node's Brotli decoder has had remote-code-execution bugs
 * (CVE-2026-111497). Here only gzip and deflate are ever decoded.
 */

import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';

const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DOWNLOAD_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 20;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const isOk = (res) => res.status >= 200 && res.status < 300;

function get(url, signal) {
  const client = url.protocol === 'https:' ? https : url.protocol === 'http:' ? http : null;
  if (!client) return Promise.reject(new Error(`Unsupported protocol ${url.protocol}`));
  return new Promise((resolve, reject) => {
    const fail = (err) => reject(signal.aborted ? signal.reason : err);
    const req = client.get(
      url,
      { headers: { 'User-Agent': BROWSER_UA, 'Accept-Encoding': 'gzip, deflate' }, signal },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('error', fail);
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers,
            body: Buffer.concat(chunks),
            url: url.href,
          })
        );
      }
    );
    req.on('error', fail);
  });
}

async function follow(url, timeoutMs) {
  const signal = AbortSignal.timeout(timeoutMs);
  let current = url;
  for (let hops = 0; ; hops++) {
    const res = await get(current, signal);
    if (!REDIRECT_STATUSES.has(res.status) || !res.headers.location) return res;
    if (hops >= MAX_REDIRECTS) throw new Error(`Too many redirects from ${url.href}`);
    current = new URL(res.headers.location, current);
  }
}

// Plain HTTP lets anyone on the path swap the response, so http:// links try HTTPS first.
// Some agency hosts serve only one of the two, so either can fall back to the other.
async function fetchPreferringHttps(rawUrl, timeoutMs) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:') return follow(url, timeoutMs);
  const secure = new URL(url);
  secure.protocol = 'https:';
  try {
    const res = await follow(secure, timeoutMs);
    if (isOk(res)) return res;
    console.warn(`HTTPS returned ${res.status} for ${secure.href}; retrying over HTTP`);
  } catch (err) {
    console.warn(`HTTPS fetch failed for ${secure.href} (${err.code || err.name}); retrying over HTTP`);
  }
  return follow(url, timeoutMs);
}

function decode(res) {
  const encoding = String(res.headers['content-encoding'] || 'identity').trim().toLowerCase();
  if (encoding === 'identity') return res.body;
  if (encoding === 'gzip' || encoding === 'x-gzip') return zlib.gunzipSync(res.body);
  if (encoding === 'deflate') {
    try {
      return zlib.inflateSync(res.body);
    } catch {
      return zlib.inflateRawSync(res.body);
    }
  }
  throw new Error(`Refusing content-encoding "${encoding}" from ${res.url}`);
}

export async function downloadFile(url, { timeoutMs = DOWNLOAD_TIMEOUT_MS } = {}) {
  const res = await fetchPreferringHttps(url, timeoutMs);
  if (!isOk(res)) {
    if (res.status === 404 || res.status === 410) return null;
    throw new Error(`Download failed ${res.status}: ${res.statusText}`);
  }
  return { buffer: decode(res), contentType: res.headers['content-type'] || '', finalUrl: res.url };
}
