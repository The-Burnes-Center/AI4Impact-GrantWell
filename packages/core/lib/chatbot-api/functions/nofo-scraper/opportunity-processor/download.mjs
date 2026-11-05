/**
 * Attachment downloads from agency hosts we don't control.
 *
 * Uses node:http/https instead of fetch because fetch decodes any Brotli body a server sends,
 * whatever we ask for, and Node's Brotli decoder has had remote-code-execution bugs
 * (CVE-2026-111497). Here only gzip and deflate are ever decoded.
 */

import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';

const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DOWNLOAD_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 50 * 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const NON_PUBLIC = new net.BlockList();
for (const [prefix, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
]) {
  NON_PUBLIC.addSubnet(prefix, bits, 'ipv4');
}
for (const [prefix, bits] of [
  ['::', 127],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
]) {
  NON_PUBLIC.addSubnet(prefix, bits, 'ipv6');
}

/** Private, loopback, link-local and other non-routable addresses. IPv4-mapped IPv6 is checked as IPv4. */
export function isPublicAddress(address) {
  const family = net.isIP(address);
  if (!family) return false;
  return !NON_PUBLIC.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

const blockedHost = (host) =>
  Object.assign(new Error(`Refusing to download from ${host}: it is not a public address`), { code: 'ERR_NON_PUBLIC_HOST' });

// Checks the addresses the socket will actually connect to, so DNS rebinding can't slip past.
function publicOnlyLookup(isAllowed) {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err);
      if (!addresses.length || addresses.some((a) => !isAllowed(a.address))) return callback(blockedHost(hostname));
      if (options.all) return callback(null, addresses);
      return callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

const isOk = (res) => res.status >= 200 && res.status < 300;

const tooLarge = (url, maxBytes) =>
  Object.assign(new Error(`Download from ${url.href} is over ${maxBytes} bytes`), { code: 'ERR_BODY_TOO_LARGE' });

function get(url, signal, { isAllowed, maxBytes }) {
  const client = url.protocol === 'https:' ? https : url.protocol === 'http:' ? http : null;
  if (!client) return Promise.reject(new Error(`Unsupported protocol ${url.protocol}`));
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  if (net.isIP(host) && !isAllowed(host)) return Promise.reject(blockedHost(host));
  return new Promise((resolve, reject) => {
    const fail = (err) => reject(signal.aborted ? signal.reason : err);
    const req = client.get(
      url,
      {
        headers: { 'User-Agent': BROWSER_UA, 'Accept-Encoding': 'gzip, deflate' },
        signal,
        lookup: publicOnlyLookup(isAllowed),
      },
      (res) => {
        if (Number(res.headers['content-length']) > maxBytes) {
          req.destroy();
          return fail(tooLarge(url, maxBytes));
        }
        const chunks = [];
        let received = 0;
        res.on('data', (chunk) => {
          received += chunk.length;
          if (received > maxBytes) {
            req.destroy();
            fail(tooLarge(url, maxBytes));
            return;
          }
          chunks.push(chunk);
        });
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

async function follow(url, timeoutMs, guards) {
  const signal = AbortSignal.timeout(timeoutMs);
  let current = url;
  for (let hops = 0; ; hops++) {
    const res = await get(current, signal, guards);
    if (!REDIRECT_STATUSES.has(res.status) || !res.headers.location) return res;
    if (hops >= MAX_REDIRECTS) throw new Error(`Too many redirects from ${url.href}`);
    current = new URL(res.headers.location, current);
  }
}

// Plain HTTP lets anyone on the path swap the response, so http:// links try HTTPS first.
// Some agency hosts serve only one of the two, so either can fall back to the other.
async function fetchPreferringHttps(rawUrl, timeoutMs, guards) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:') return follow(url, timeoutMs, guards);
  const secure = new URL(url);
  secure.protocol = 'https:';
  try {
    const res = await follow(secure, timeoutMs, guards);
    if (isOk(res)) return res;
    console.warn(`HTTPS returned ${res.status} for ${secure.href}; retrying over HTTP`);
  } catch (err) {
    console.warn(`HTTPS fetch failed for ${secure.href} (${err.code || err.name}); retrying over HTTP`);
  }
  return follow(url, timeoutMs, guards);
}

function decode(res, maxBytes) {
  const encoding = String(res.headers['content-encoding'] || 'identity').trim().toLowerCase();
  const limit = { maxOutputLength: maxBytes };
  if (encoding === 'identity') return res.body;
  if (encoding === 'gzip' || encoding === 'x-gzip') return zlib.gunzipSync(res.body, limit);
  if (encoding === 'deflate') {
    try {
      return zlib.inflateSync(res.body, limit);
    } catch (err) {
      if (err.code === 'ERR_BUFFER_TOO_LARGE') throw err;
      return zlib.inflateRawSync(res.body, limit);
    }
  }
  throw new Error(`Refusing content-encoding "${encoding}" from ${res.url}`);
}

/** isAllowed and maxBytes are for tests; production always uses the defaults. */
export async function downloadFile(
  url,
  { timeoutMs = DOWNLOAD_TIMEOUT_MS, isAllowed = isPublicAddress, maxBytes = MAX_BODY_BYTES } = {}
) {
  const res = await fetchPreferringHttps(url, timeoutMs, { isAllowed, maxBytes });
  if (!isOk(res)) {
    if (res.status === 404 || res.status === 410) return null;
    throw new Error(`Download failed ${res.status}: ${res.statusText}`);
  }
  return { buffer: decode(res, maxBytes), contentType: res.headers['content-type'] || '', finalUrl: res.url };
}
