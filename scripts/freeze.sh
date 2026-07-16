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
#
#   <instance>     an id present in lib/user-interface/app/config/instances/<instance>.ts
#   [output-dir]   where to write the deliverable (default: ../grantwell-<instance>)
#
# Example:
#   scripts/freeze.sh generic
#   scripts/freeze.sh generic /tmp/grantwell-generic
#
set -euo pipefail

INSTANCE="${1:-}"
if [[ -z "$INSTANCE" ]]; then
  echo "usage: scripts/freeze.sh <instance> [output-dir]" >&2
  exit 2
fi

REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$REPO_ROOT"

INSTANCE_FILE="lib/user-interface/app/config/instances/${INSTANCE}.ts"
if [[ ! -f "$INSTANCE_FILE" ]]; then
  echo "error: no config for instance '${INSTANCE}' ($INSTANCE_FILE not found)" >&2
  echo "known instances:" >&2
  ls lib/user-interface/app/config/instances/*.ts 2>/dev/null | sed 's#.*/##; s#\.ts$##; s#^#  - #' >&2
  exit 1
fi

OUT_DIR="${2:-../grantwell-${INSTANCE}}"

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

# The frozen core builds this instance by default — bake the selection into an .env the app reads,
# so a state's build/deploy needs no extra flag. (vite honors GRANTWELL_INSTANCE; see vite.config.ts.)
# The instance branding the build actually reads lives in core/.../config/instances/<instance>.ts;
# config/instance.ts here is a top-level pointer/copy for the owner to find and edit easily.
mkdir -p "$OUT_DIR/config"
cp "$INSTANCE_FILE" "$OUT_DIR/config/instance.ts"
printf 'GRANTWELL_INSTANCE=%s\n' "$INSTANCE" > "$OUT_DIR/config/instance.env"

cat > "$OUT_DIR/VERSION" <<EOF
core ${VERSION_TAG}
commit ${COMMIT}
instance ${INSTANCE}
EOF

# Handoff docs live with the deliverable, not in the engine.
mkdir -p "$OUT_DIR/docs"
cat > "$OUT_DIR/docs/HANDOFF.md" <<EOF
# grantwell-${INSTANCE} — handoff

This repo is a frozen, self-contained copy of GrantWell you own and run.

- \`core/\`   the neutral engine, frozen at \`${VERSION_TAG}\` (commit \`${COMMIT}\`). Auditable and
             editable — but edits make future core updates a merge instead of a folder swap.
- \`config/\` everything specific to this deployment. \`instance.ts\` is your branding; the engine
             reads it via the \`GRANTWELL_INSTANCE=${INSTANCE}\` selection in \`instance.env\`.
- \`VERSION\` the core version this deliverable was cut from.

## Configure
Your branding is \`core/lib/user-interface/app/config/instances/${INSTANCE}.ts\` (name, colors, logo,
footer, analytics); \`config/instance.ts\` at the top level is a copy of it for convenience — edit the
one under \`core/\`, which the build reads. To change AWS identity, edit \`core/lib/constants.ts\` /
stack env as documented in \`core/README.md\`.

## Build & deploy
The engine builds this instance by default. From \`core/\`:

    npm install
    (cd lib/user-interface/app && npm install && GRANTWELL_INSTANCE=${INSTANCE} npm run build)
    npx cdk deploy

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
