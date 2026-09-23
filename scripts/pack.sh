#!/usr/bin/env bash
# Builds grantwell-core-<v>.tgz and grantwell-ui-<v>.tgz from the files of packages/ that git would commit.
# Usage: scripts/pack.sh [dest]   (default: instances/generic/vendor; release.sh prepare uses this)
#        scripts/pack.sh --dev    Generic built from source in build/generic/ (gitignored), installed and
#                                 ready to synth or deploy. Dev deploys and CI use this; it never touches
#                                 the committed instances/generic.
set -euo pipefail

repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
generic="$repo/instances/generic"
devdir="$repo/build/generic"
dev=false
if [ "${1:-}" = --dev ]; then
  dev=true
  dest="$devdir/vendor"
else
  dest=$(realpath -m "${1:-$generic/vendor}")
fi
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

if $dev; then
  rm -rf "$devdir"
  mkdir -p "$devdir"
  git -C "$generic" ls-files -z --cached --others --exclude-standard -- . ':!vendor/*.tgz' | tar -C "$generic" --null -T - -cf - | tar -C "$devdir" -xf -
fi

# Ignored files never reach an artifact: local node_modules, dist/, staged UI config.
git -C "$repo" ls-files -z --cached --others --exclude-standard packages/core packages/ui | tar -C "$repo" --null -T - -cf - | tar -C "$work" -xf -

core="$work/packages/core"
(cd "$core" && npm ci --ignore-scripts --no-audit --no-fund --loglevel=error >/dev/null && npx tsc -p . && rm -rf node_modules)

# The UI ships as a source project under app/ so its lockfile survives npm pack (which drops a
# package's own lockfile) and installing grantwell-ui pulls in none of its dependencies.
ui="$work/ui"
mkdir -p "$ui"
mv "$work/packages/ui" "$ui/app"
rm -f "$ui/app/.gitignore"
node -e '
  const app = require(process.argv[1]);
  const wrapper = {
    name: app.name,
    version: app.version,
    license: app.license,
    description: "GrantWell web app source. Built by grantwell-core at synth time.",
    files: ["app"],
  };
  require("fs").writeFileSync(process.argv[2], JSON.stringify(wrapper, null, 2) + "\n");
' "$ui/app/package.json" "$ui/package.json"

mkdir -p "$dest"
rm -f "$dest"/grantwell-core-*.tgz "$dest"/grantwell-ui-*.tgz
for pkg in "$core" "$ui"; do
  (cd "$pkg" && npm pack --pack-destination "$dest" --loglevel=error >/dev/null)
done
(cd "$dest" && sha256sum grantwell-core-*.tgz grantwell-ui-*.tgz)

# Plain `npm install` keeps a stale lockfile integrity for a same-version tarball; naming the files refreshes it.
instance=
if $dev; then
  instance=$devdir
elif [ "$dest" = "$generic/vendor" ]; then
  instance=$generic
fi
if [ -n "$instance" ]; then
  (cd "$instance" && npm install --no-audit --no-fund --loglevel=error ./vendor/grantwell-core-*.tgz ./vendor/grantwell-ui-*.tgz >/dev/null)
  node "$instance/scripts/check-vendor.mjs"
fi
