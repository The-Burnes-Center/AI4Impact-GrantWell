#!/usr/bin/env bash
#
# freeze.sh — produce a frozen, self-contained deliverable repo for one instance.
#
# Snapshots the neutral engine at the current git commit into <out>/core/, pairs it with that
# instance's config slice under <out>/config/, and writes VERSION + handoff docs. The result is
# what a state owns: an auditable, editable copy of the engine plus only their own config.
#
# Usage:
#   scripts/freeze.sh <instance> [output-dir]
#   scripts/freeze.sh --template <name> [output-dir]
#
#   <instance>       an id present in lib/user-interface/app/config/instances/<instance>.ts
#   --template <name>  seed the deliverable from lib/user-interface/app/config/templates/<name>/
#                      instead — for instances (e.g. ma) that are NOT committed to this engine
#                      because they carry their own chrome/design system. The template supplies
#                      config/instances/<name>.ts (+ chrome/, infra snippet) into the frozen core.
#   [output-dir]     where to write the deliverable (default: ../grantwell-<instance>)
#
# Example:
#   scripts/freeze.sh generic
#   scripts/freeze.sh --template ma ../grantwell-ma
#
set -euo pipefail

TEMPLATE=""
if [[ "${1:-}" == "--template" ]]; then
  TEMPLATE="${2:-}"
  INSTANCE="$TEMPLATE"
  OUT_DIR="${3:-../grantwell-${INSTANCE}}"
  [[ -z "$TEMPLATE" ]] && { echo "usage: scripts/freeze.sh --template <name> [output-dir]" >&2; exit 2; }
else
  INSTANCE="${1:-}"
  OUT_DIR="${2:-../grantwell-${INSTANCE}}"
  [[ -z "$INSTANCE" ]] && { echo "usage: scripts/freeze.sh <instance> [output-dir]" >&2; exit 2; }
fi

REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$REPO_ROOT"

APP_CONFIG="lib/user-interface/app/config"
INSTANCE_FILE="$APP_CONFIG/instances/${INSTANCE}.ts"
TEMPLATE_DIR="$APP_CONFIG/templates/${TEMPLATE}"

if [[ -n "$TEMPLATE" ]]; then
  if [[ ! -d "$TEMPLATE_DIR" ]]; then
    echo "error: no template '${TEMPLATE}' ($TEMPLATE_DIR not found)" >&2
    ls -d "$APP_CONFIG"/templates/*/ 2>/dev/null | sed 's#.*/templates/##; s#/$##; s#^#  - #' >&2
    exit 1
  fi
elif [[ ! -f "$INSTANCE_FILE" ]]; then
  echo "error: no config for instance '${INSTANCE}' ($INSTANCE_FILE not found)" >&2
  echo "known instances:" >&2
  ls "$APP_CONFIG"/instances/*.ts 2>/dev/null | sed 's#.*/##; s#\.ts$##; s#^#  - #' >&2
  echo "or use --template <name> for an out-of-core instance (e.g. ma)" >&2
  exit 1
fi

# Version stamp: prefer an exact tag on HEAD, else describe, else short sha.
if VERSION_TAG="$(git describe --tags --exact-match 2>/dev/null)"; then
  :
elif VERSION_TAG="$(git describe --tags 2>/dev/null)"; then
  :
else
  VERSION_TAG="$(git rev-parse --short HEAD)"
fi
COMMIT="$(git rev-parse HEAD)"

if [[ -e "$OUT_DIR" ]]; then
  echo "error: output dir '$OUT_DIR' already exists — remove it or pick another" >&2
  exit 1
fi

echo "Freezing engine @ ${VERSION_TAG} for instance '${INSTANCE}' -> ${OUT_DIR}"
mkdir -p "$OUT_DIR/core"

# core/ = the engine at HEAD, via git archive so it honors .gitignore and carries no working-tree
# cruft (dist, node_modules, cdk.out, aws-exports.json are all already gitignored/untracked).
git archive --format=tar HEAD | tar -x -C "$OUT_DIR/core"

CORE_APP_CONFIG="$OUT_DIR/core/$APP_CONFIG"
CHROME_ENV=""

# A template-seeded instance (e.g. ma) isn't committed to the engine, so git archive didn't include
# it — materialize it into the frozen core from the template: the branding instance file, its chrome
# barrel (selected via GRANTWELL_CHROME), and the infra snippet for the owner to paste.
if [[ -n "$TEMPLATE" ]]; then
  cp "$TEMPLATE_DIR/instance.ts" "$CORE_APP_CONFIG/instances/${INSTANCE}.ts"
  INSTANCE_FILE="$TEMPLATE_DIR/instance.ts"
  if [[ -d "$TEMPLATE_DIR/chrome" ]]; then
    cp -r "$TEMPLATE_DIR/chrome" "$CORE_APP_CONFIG/${INSTANCE}-chrome"
    CHROME_ENV="GRANTWELL_CHROME=config/${INSTANCE}-chrome/index.ts "
  fi
fi

# GRANTWELL_INSTANCE selects both halves of the config seam: frontend branding
# (core/.../config/instances/<instance>.ts, read by vite) and backend/infra identity
# (core/lib/shared/instance-infra.ts INSTANCE_INFRA registry, read by constants.ts + bin). The
# top-level config/ here holds owner-facing copies/pointers; the files the build reads live in core/.
mkdir -p "$OUT_DIR/config"
cp "$INSTANCE_FILE" "$OUT_DIR/config/instance.ts"
{
  echo "GRANTWELL_INSTANCE=${INSTANCE}"
  [[ -n "$CHROME_ENV" ]] && echo "GRANTWELL_CHROME=config/${INSTANCE}-chrome/index.ts"
} > "$OUT_DIR/config/instance.env"
[[ -n "$TEMPLATE" && -f "$TEMPLATE_DIR/infra.snippet.ts" ]] && cp "$TEMPLATE_DIR/infra.snippet.ts" "$OUT_DIR/config/infra.snippet.ts"

# Warn if this instance has no backend infra entry yet — its stack/cognito/kb names will fall back
# to the ENVIRONMENT switch, which is NOT what a config-driven deliverable wants.
if ! grep -q "\"${INSTANCE}\"" core/lib/shared/instance-infra.ts 2>/dev/null; then
  echo "  note: instance '${INSTANCE}' has no INSTANCE_INFRA entry — add one in" >&2
  echo "        core/lib/shared/instance-infra.ts before deploying (see docs/HANDOFF.md)." >&2
fi

cat > "$OUT_DIR/VERSION" <<EOF
core ${VERSION_TAG}
commit ${COMMIT}
instance ${INSTANCE}
EOF

# Chrome-override lines, only rendered into the handoff when a template carried its own chrome.
if [[ -n "$CHROME_ENV" ]]; then
  CHROME_DOC="- **chrome** — \`config/${INSTANCE}-chrome/\` supplies this deployment's header/nav/footer
             (its design system), selected via \`GRANTWELL_CHROME\`. Fill in its \`index.ts\`."
  BUILD_ENV="GRANTWELL_INSTANCE=${INSTANCE} ${CHROME_ENV}"
else
  CHROME_DOC=""
  BUILD_ENV="GRANTWELL_INSTANCE=${INSTANCE} "
fi

# Handoff docs live with the deliverable, not in the engine.
mkdir -p "$OUT_DIR/docs"
cat > "$OUT_DIR/docs/HANDOFF.md" <<EOF
# grantwell-${INSTANCE} — handoff

This repo is a frozen, self-contained copy of GrantWell you own and run.

- \`core/\`   the neutral engine, frozen at \`${VERSION_TAG}\` (commit \`${COMMIT}\`). Auditable and
             editable — but edits make future core updates a merge instead of a folder swap.
- \`config/\` everything specific to this deployment, selected by \`GRANTWELL_INSTANCE=${INSTANCE}\`
             (\`instance.env\`). Two halves, both read from \`core/\`:
             **branding** — \`core/lib/user-interface/app/config/instances/${INSTANCE}.ts\`
             **infra identity** — \`core/lib/shared/instance-infra.ts\` (stack/Cognito/KB names, AWS acct)
${CHROME_DOC}
- \`VERSION\` the core version this deliverable was cut from.

## Configure
1. **Branding:** edit \`core/lib/user-interface/app/config/instances/${INSTANCE}.ts\` (name, colors,
   logo, footer, analytics). \`config/instance.ts\` here is a convenience copy — the one under
   \`core/\` is what the build reads.
2. **Infra identity:** add your entry to \`INSTANCE_INFRA\` in \`core/lib/shared/instance-infra.ts\`
   keyed \`"${INSTANCE}"\` — \`stackName\`, \`cognitoDomainName\`, \`knowledgeBaseIndexName\`, optional
   \`deploymentUrl\` and \`aws: { account, region }\`. Without it, names fall back to the engine's
   ENVIRONMENT defaults, which you do not want.

## Build & deploy
Set \`GRANTWELL_INSTANCE\` for BOTH the frontend build and the cdk deploy so each half of the seam
activates. From \`core/\`:

    npm install
    (cd lib/user-interface/app && npm install && ${BUILD_ENV}npm run build)
    GRANTWELL_INSTANCE=${INSTANCE} npx cdk deploy

## Take a core update
Ask Burnes for a newer core version, then:
- config-only (you never edited \`core/\`): replace \`core/\` with the new snapshot, keep \`config/\`.
- if you edited \`core/\`: git-merge the new core; your \`config/\` is unaffected.
EOF

echo "Done."
echo "  $OUT_DIR/core     (engine @ ${VERSION_TAG})"
echo "  $OUT_DIR/config   (instance '${INSTANCE}')"
echo "  $OUT_DIR/VERSION"
echo "  $OUT_DIR/docs/HANDOFF.md"
