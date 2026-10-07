#!/usr/bin/env bash
# Copies the current commit's template/ (plus LICENSE and NOTICE) into a checkout of the grantwell-template
# repo, commits it as "GrantWell <version>" and tags it v<version>, where <version> is what template/package.json
# pins. Without --push it stops there and shows what changed; release.yml pushes for final tags only.
# Usage: scripts/sync-template.sh <template checkout> [--push]
set -euo pipefail

dest=${1:-}
push=${2:-}
if [ -z "$dest" ] || ! git -C "$dest" rev-parse --git-dir >/dev/null 2>&1 || { [ -n "$push" ] && [ "$push" != --push ]; }; then
  echo "Usage: scripts/sync-template.sh <template checkout> [--push]" >&2
  exit 2
fi
repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
dest=$(cd "$dest" && pwd)
sha=$(git -C "$repo" rev-parse HEAD)
source_repo=${GITHUB_REPOSITORY:-The-Burnes-Center/AI4Impact-GrantWell}

version=$(git -C "$repo" show HEAD:template/package.json | node -e '
const deps = JSON.parse(require("fs").readFileSync(0, "utf8")).dependencies;
const versions = ["grantwell-core", "grantwell-ui"].map((n) => (/^file:vendor\/grantwell-[a-z]+-(.+)\.tgz$/.exec(deps[n] ?? "") ?? [])[1]);
if (!versions[0] || versions[0] !== versions[1]) { console.error(`template/package.json pins ${versions.join(" and ")}`); process.exit(1); }
console.log(versions[0]);')
tag="v$version"
if [ -n "$(git -C "$repo" status --porcelain -- template LICENSE NOTICE)" ]; then
  echo "Note: uncommitted changes under template/ are not synced; this copies $sha." >&2
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git -C "$repo" archive HEAD:template | tar -x -C "$work"
git -C "$repo" archive HEAD LICENSE NOTICE | tar -x -C "$work"
rsync -a --delete --exclude /.git "$work/" "$dest/"

cd "$dest"
git add -A
if git diff --cached --quiet; then
  echo "grantwell-template already matches $sha."
else
  git commit -q -m "GrantWell $version" -m "From $source_repo@$sha"
  git show --stat --format='%h %s%n%b' HEAD
fi

if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  if [ "$(git rev-parse "$tag^{commit}")" != "$(git rev-parse HEAD)" ]; then
    echo "$tag already exists in grantwell-template at another commit." >&2
    exit 1
  fi
else
  git tag -a "$tag" -m "GrantWell $version"
fi

if [ "$push" = --push ]; then
  git push origin HEAD:main "refs/tags/$tag"
  echo "Pushed $tag to grantwell-template."
else
  echo "Dry run: $tag is in $dest only, not pushed."
fi
