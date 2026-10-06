#!/usr/bin/env bash
# Upgrades this instance to a GrantWell release: downloads both .tgz files, verifies their checksums,
# swaps vendor/, reinstalls, checks, and lists which generated templates the upgrade changes.
# Usage: scripts/upgrade.sh <version>        e.g. scripts/upgrade.sh 3.0.0
# Env:   GRANTWELL_REPO, GITHUB_TOKEN (see fetch-release.sh)
set -euo pipefail

version=${1:-}
if ! [[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$ ]]; then
  echo "Usage: scripts/upgrade.sh <version>   (e.g. 3.0.0 or 3.0.0-rc.1)" >&2
  exit 2
fi
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

if [ ! -f package-lock.json ] || ! ls vendor/grantwell-core-*.tgz vendor/grantwell-ui-*.tgz >/dev/null 2>&1; then
  echo "No installed release to upgrade from: run scripts/install.sh <version> first." >&2
  exit 1
fi

work=$(mktemp -d)
backup="$work/backup"
mkdir -p "$backup/vendor"
cp package.json package-lock.json "$backup/"
cp vendor/grantwell-*.tgz "$backup/vendor/"
swapped=false
cleanup() {
  status=$?
  if [ $status -ne 0 ] && $swapped; then
    rm -f vendor/grantwell-*.tgz
    cp "$backup"/vendor/*.tgz vendor/
    cp "$backup/package.json" "$backup/package-lock.json" .
    echo "Upgrade failed; vendor/, package.json and package-lock.json are restored. Run npm ci before continuing." >&2
  fi
  rm -rf "$work"
  exit $status
}
trap cleanup EXIT

core="grantwell-core-$version.tgz"
ui="grantwell-ui-$version.tgz"
scripts/fetch-release.sh "$version" "$work"

echo "Generating templates for the current version"
node scripts/check-vendor.mjs
npm ci --no-audit --no-fund
node scripts/synth.mjs synth cdk.out/upgrade/before

swapped=true
rm -f vendor/grantwell-core-*.tgz vendor/grantwell-ui-*.tgz
cp "$work/$core" "$work/$ui" vendor/
# Naming the files refreshes the lockfile integrity; plain `npm install` would keep the old one.
npm install --no-audit --no-fund "./vendor/$core" "./vendor/$ui"
node scripts/check-vendor.mjs
npm run typecheck

echo "Generating templates for $version"
node scripts/synth.mjs synth cdk.out/upgrade/after
echo
node scripts/synth.mjs compare cdk.out/upgrade/before cdk.out/upgrade/after
echo
echo "Upgraded to $version. Templates are in cdk.out/upgrade/{before,after}."
echo "Review git diff, then commit vendor/, package.json and package-lock.json."
