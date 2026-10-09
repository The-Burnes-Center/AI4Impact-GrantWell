#!/usr/bin/env node
/**
 * Writes test/fixtures/lambda-runtime-sdk-nodejs24.json: the @aws-sdk packages and CommonJS export
 * names the Lambda nodejs24.x runtime ships, read from the public base image (linux/amd64).
 * Re-run when a handler imports a new client or command, or after AWS updates the runtime; then run
 * test/lambda-runtime-sdk.test.ts.
 *
 *   node scripts/lambda-runtime-sdk.mjs [--image public.ecr.aws/lambda/nodejs:24]
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.join(here, "../lib");
const OUT = path.join(here, "../test/fixtures/lambda-runtime-sdk-nodejs24.json");
const SDK_DIR = "var/runtime/node_modules/@aws-sdk";

const argIdx = process.argv.indexOf("--image");
const image = argIdx > 0 ? process.argv[argIdx + 1] : "public.ecr.aws/lambda/nodejs:24";
const m = image.match(/^public\.ecr\.aws\/([^:@]+):([\w.-]+)$/);
if (!m) throw new Error(`expected public.ecr.aws/<repo>:<tag>, got ${image}`);
const [, repo, tag] = m;
const registry = `https://public.ecr.aws/v2/${repo}`;

const MANIFEST_TYPES = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

const tokenRes = await fetch(`https://public.ecr.aws/token/?scope=repository:${repo}:pull`);
if (!tokenRes.ok) throw new Error(`token: HTTP ${tokenRes.status}`);
const { token } = await tokenRes.json();
const auth = { Authorization: `Bearer ${token}` };

async function manifest(ref) {
  const res = await fetch(`${registry}/manifests/${ref}`, { headers: { ...auth, Accept: MANIFEST_TYPES } });
  if (!res.ok) throw new Error(`manifest ${ref}: HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  return { digest: `sha256:${createHash("sha256").update(body).digest("hex")}`, json: JSON.parse(body.toString()) };
}

let top = await manifest(tag);
if (top.json.manifests) {
  const entry = top.json.manifests.find((x) => x.platform?.os === "linux" && x.platform?.architecture === "amd64");
  if (!entry) throw new Error(`${image} has no linux/amd64 manifest`);
  top = await manifest(entry.digest);
}
const { digest, json: imageManifest } = top;

async function download(layerDigest, file) {
  const res = await fetch(`${registry}/blobs/${layerDigest}`, { headers: auth });
  if (!res.ok) throw new Error(`blob ${layerDigest}: HTTP ${res.status}`);
  const hash = createHash("sha256");
  const tee = new Transform({ transform: (chunk, _e, cb) => (hash.update(chunk), cb(null, chunk)) });
  await pipeline(Readable.fromWeb(res.body), tee, createWriteStream(file));
  if (`sha256:${hash.digest("hex")}` !== layerDigest) throw new Error(`blob ${layerDigest}: digest mismatch`);
}

const work = mkdtempSync(path.join(tmpdir(), "lambda-runtime-sdk-"));
try {
  // The runtime layer is normally the last one, so walk top-down and stop at the first hit.
  let layerFile, prefix;
  for (const layer of [...imageManifest.layers].reverse()) {
    const file = path.join(work, layer.digest.replace(":", "-"));
    process.stderr.write(`layer ${layer.digest} (${(layer.size / 1e6).toFixed(1)} MB)\n`);
    await download(layer.digest, file);
    const listing = execFileSync("tar", ["-tzf", file], { maxBuffer: 1 << 30, encoding: "utf8" });
    const hit = listing.split("\n").find((p) => p.replace(/^\.\//, "").startsWith(`${SDK_DIR}/`));
    if (hit) {
      layerFile = file;
      prefix = hit.startsWith("./") ? "./" : "";
      break;
    }
    rmSync(file);
  }
  if (!layerFile) throw new Error(`no layer of ${image} contains ${SDK_DIR}`);

  const root = path.join(work, "rootfs");
  mkdirSync(root);
  execFileSync("tar", [
    "-xzf", layerFile, "-C", root, "--no-same-owner", "--wildcards", "--no-wildcards-match-slash",
    `${prefix}${SDK_DIR}/*/package.json`, `${prefix}${SDK_DIR}/*/dist-cjs/index.js`,
  ]);

  const imported = repoImportedPackages();
  const packages = {};
  const sdkDir = path.join(root, SDK_DIR);
  for (const dir of readdirSync(sdkDir).sort()) {
    const pkgJson = path.join(sdkDir, dir, "package.json");
    if (!existsSync(pkgJson)) continue;
    const name = `@aws-sdk/${dir}`;
    const entry = { version: JSON.parse(readFileSync(pkgJson, "utf8")).version };
    if (imported.has(name)) {
      const index = path.join(sdkDir, dir, "dist-cjs/index.js");
      const src = existsSync(index) ? readFileSync(index, "utf8") : "";
      entry.exports = [...new Set([...src.matchAll(/(?<![\w$.])exports\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map((x) => x[1]))].sort();
      const reexports = [...src.matchAll(/__exportStar\)?\(\s*require\(\s*["']([^"']+)["']\s*\)/g)].map((x) => x[1]);
      if (reexports.length) entry.reexports = reexports;
    }
    packages[name] = entry;
  }

  const counts = {};
  for (const [n, p] of Object.entries(packages)) if (n.startsWith("@aws-sdk/client-")) counts[p.version] = (counts[p.version] ?? 0) + 1;
  const sdkVersion = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];

  const fixture = { image, platform: "linux/amd64", digest, sdkVersion, generatedAt: new Date().toISOString(), packages };
  const text = "{\n" + Object.entries(fixture).map(([k, v]) => k === "packages"
    ? `  "packages": {\n${Object.entries(v).map(([n, p]) => `    ${JSON.stringify(n)}: ${JSON.stringify(p)}`).join(",\n")}\n  }`
    : `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n") + "\n}\n";
  writeFileSync(OUT, text);
  const withExports = Object.values(packages).filter((p) => p.exports).length;
  console.log(`${path.relative(process.cwd(), OUT)}: SDK ${sdkVersion}, ${Object.keys(packages).length} packages (${withExports} with exports), ${(text.length / 1024).toFixed(0)} KiB`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

// Export names only for packages the handlers mention: all ~550 would be ~3.5 MB.
function repoImportedPackages() {
  const found = new Set();
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "vendor" || e.name === "cdk.out") continue;
        if (e.name === "node_modules") {
          if (existsSync(path.join(p, "grantwell-shared"))) walk(path.join(p, "grantwell-shared"));
          continue;
        }
        walk(p);
      } else if (/\.(mjs|cjs|js)$/.test(e.name)) {
        for (const x of readFileSync(p, "utf8").matchAll(/["'](@aws-sdk\/[\w.-]+)/g)) found.add(x[1]);
      }
    }
  };
  walk(LIB);
  return found;
}
