#!/usr/bin/env bash
# MA template patcher — run by freeze.sh after the chrome is copied in. Applies the MA-specific
# changes the neutral core doesn't carry: Mayflower deps + CDN stylesheets, its type decl, and the
# tsconfig @chrome path. $1 = frozen core's user-interface/app dir; $2 = instance id.
set -euo pipefail
APP="$1"
INSTANCE="${2:-ma}"

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
