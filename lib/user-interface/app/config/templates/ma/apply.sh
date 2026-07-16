#!/usr/bin/env bash
# MA template patcher — run by freeze.sh after the chrome is copied in. Applies the MA-specific
# changes the neutral core doesn't carry: Mayflower deps + CDN stylesheets, its type decl, the
# tsconfig @chrome path, the ma/ma-staging infra entries, and the deliverable CI/docs.
# $1 = frozen core's user-interface/app dir; $2 = instance id.
set -euo pipefail
APP="$1"
INSTANCE="${2:-ma}"
CORE="$(cd "$APP/../../.." && pwd)"          # frozen deliverable core/
OUT="$(cd "$CORE/.." && pwd)"                # deliverable root
TEMPLATE_DIR="$(cd "$(dirname "$0")" && pwd)"

# 1. Mayflower deps (Mayflower's peer deps require --legacy-peer-deps at install — see HANDOFF).
node -e '
  const fs = require("fs"), p = process.argv[1];
  const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
  pkg.dependencies = { "@massds/mayflower-assets": "^13.2.0", "@massds/mayflower-react": "^14.1.0", ...pkg.dependencies };
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
' "$APP/package.json"

# 2. Mayflower CDN stylesheets in index.html (the components ship JS only).
if ! grep -q "mayflower-assets@14.1.0/css/header-slim.css" "$APP/index.html"; then
  node -e '
    const fs = require("fs"), p = process.argv[1];
    const links = [
      `    <!-- MA Mayflower chrome stylesheets (config/${process.argv[2]}-chrome). -->`,
      `    <link rel="stylesheet" href="https://unpkg.com/@massds/mayflower-assets@14.1.0/css/brand-banner.css" />`,
      `    <link rel="stylesheet" href="https://unpkg.com/@massds/mayflower-assets@14.1.0/css/header-slim.css" />`,
      `    <link rel="stylesheet" href="https://unpkg.com/@massds/mayflower-assets@14.1.0/css/footer.css" />`,
    ].join("\n");
    let html = fs.readFileSync(p, "utf8");
    html = html.replace("</head>", links + "\n  </head>");
    fs.writeFileSync(p, html);
  ' "$APP/index.html" "$INSTANCE"
fi

# 3. Mayflower ships no type declarations — declare the module.
if ! grep -q '@massds/mayflower-react' "$APP/src/global.d.ts"; then
  printf '\ndeclare module "@massds/mayflower-react";\n' >> "$APP/src/global.d.ts"
fi

# 4. Point tsc's @chrome at the MA chrome barrel (vite already uses GRANTWELL_CHROME).
node -e '
  const fs = require("fs"), p = process.argv[1], inst = process.argv[2];
  let s = fs.readFileSync(p, "utf8");
  s = s.replace(/"@chrome":\s*\[[^\]]*\]/, `"@chrome": ["config/${inst}-chrome/index.tsx"]`);
  fs.writeFileSync(p, s);
' "$APP/tsconfig.json" "$INSTANCE"

# 5. INSTANCE_INFRA entries: ma (live prod) + ma-staging (isolated B3 parity target). Injected into
# the empty registry so the deliverable is deploy-ready without hand-editing.
node -e '
  const fs = require("fs"), p = process.argv[1];
  let s = fs.readFileSync(p, "utf8");
  const entries = `export const INSTANCE_INFRA: Record<string, InstanceInfra> = {
  // MA prod — values from the MA branch (main). These feed CDK logical IDs on the LIVE stack; do
  // not rename or a deploy replaces stateful resources instead of updating in place.
  ma: {
    stackName: "gw-stack-prod",
    cognitoDomainName: "gw-auth-prod",
    knowledgeBaseIndexName: "knowledge-base-index-prod",
    deploymentUrl: "https://d1mu5xcqb0ac30.cloudfront.net/",
    aws: { account: "976046823671", region: "us-east-1" },
  },
  // B3 parity target — ISOLATED names, no account binding, so it never collides with prod.
  "ma-staging": {
    stackName: "grantwell-ma-staging",
    cognitoDomainName: "gw-auth-ma-staging",
    knowledgeBaseIndexName: "knowledge-base-index-ma-staging",
  },
};`;
  s = s.replace(/export const INSTANCE_INFRA:[^=]*=\s*\{\s*\};/, entries);
  fs.writeFileSync(p, s);
' "$CORE/lib/shared/instance-infra.ts"

# 6. ma-staging branding = same frontend as ma (only infra differs).
printf "// ma-staging shares MA's branding; only INSTANCE_INFRA differs (isolated B3 stack).\nexport { branding } from \"./ma\";\n" \
  > "$APP/config/instances/ma-staging.ts"

# 7. Deliverable CI workflow + parity doc (deploy-ma-staging.yml, B3-PARITY.md).
if [[ -d "$TEMPLATE_DIR/deliverable-assets" ]]; then
  cp -r "$TEMPLATE_DIR/deliverable-assets/." "$OUT/"
fi
