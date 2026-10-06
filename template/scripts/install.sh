#!/usr/bin/env bash
# First install of GrantWell into an instance repo made from template/: downloads a release, verifies its
# checksums, fills vendor/, installs, checks, and generates templates for every deployment in config/.
# Later versions go through upgrade.sh.
# Usage: scripts/install.sh <version>        e.g. scripts/install.sh 3.0.0
# Env:   GRANTWELL_REPO, GITHUB_TOKEN (see fetch-release.sh)
set -euo pipefail

version=${1:-}
if ! [[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$ ]]; then
  echo "Usage: scripts/install.sh <version>   (e.g. 3.0.0 or 3.0.0-rc.1)" >&2
  exit 2
fi
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

if [ -f package-lock.json ] || ls vendor/grantwell-*.tgz >/dev/null 2>&1; then
  echo "A GrantWell release is already installed here: use scripts/upgrade.sh <version>." >&2
  exit 1
fi

work=$(mktemp -d)
cp package.json "$work/package.json"
installed=false
cleanup() {
  status=$?
  if [ $status -ne 0 ] && $installed; then
    rm -f vendor/grantwell-*.tgz package-lock.json
    cp "$work/package.json" package.json
    echo "Install failed; vendor/, package.json and package-lock.json are back as they were." >&2
  fi
  rm -rf "$work"
  exit $status
}
trap cleanup EXIT

core="grantwell-core-$version.tgz"
ui="grantwell-ui-$version.tgz"
scripts/fetch-release.sh "$version" "$work/release"

installed=true
mkdir -p vendor
cp "$work/release/$core" "$work/release/$ui" vendor/
# Naming the files points package.json at them and writes their integrity into the new lockfile.
npm install --no-audit --no-fund "./vendor/$core" "./vendor/$ui"
node scripts/check-vendor.mjs
npm run typecheck

echo "Generating templates"
node scripts/synth.mjs synth cdk.out/install
echo
echo "Installed $version. Templates are in cdk.out/install/."
echo "Commit vendor/, package.json and package-lock.json."
