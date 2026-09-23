#!/usr/bin/env bash
# Downloads a GrantWell release's two .tgz files into a directory and verifies them against its SHA256SUMS.
# Used by install.sh and upgrade.sh.
# Usage: scripts/fetch-release.sh <version> <dir>
# Env:   GRANTWELL_REPO  source repo (default The-Burnes-Center/AI4Impact-GrantWell)
#        GITHUB_TOKEN    only needed if the source repo is private
set -euo pipefail

version=${1:-}
dir=${2:-}
if ! [[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$ ]] || [ -z "$dir" ]; then
  echo "Usage: scripts/fetch-release.sh <version> <dir>   (e.g. 3.0.0 or 3.0.0-rc.1)" >&2
  exit 2
fi
repo=${GRANTWELL_REPO:-The-Burnes-Center/AI4Impact-GrantWell}
tag="v$version"
mkdir -p "$dir"

download() {
  local file=$1
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    # Private repos only serve assets through the API.
    local url
    url=$(curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" "https://api.github.com/repos/$repo/releases/tags/$tag" |
      node -e 'const r = JSON.parse(require("fs").readFileSync(0, "utf8")); const a = r.assets.find((a) => a.name === process.argv[1]); if (!a) process.exit(1); console.log(a.url);' "$file") ||
      { echo "$file is not attached to release $tag of $repo" >&2; return 1; }
    curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/octet-stream" -o "$dir/$file" "$url"
  else
    curl -fsSL -o "$dir/$file" "https://github.com/$repo/releases/download/$tag/$file"
  fi
}

core="grantwell-core-$version.tgz"
ui="grantwell-ui-$version.tgz"
echo "Downloading $tag from $repo"
for file in SHA256SUMS "$core" "$ui"; do
  download "$file"
done

# Checks only the two files downloaded, but both must be listed.
grep -E "  ($core|$ui)\$" "$dir/SHA256SUMS" > "$dir/SHA256SUMS.tgz" || true
if [ "$(wc -l < "$dir/SHA256SUMS.tgz")" -ne 2 ]; then
  echo "SHA256SUMS does not list both $core and $ui" >&2
  exit 1
fi
if command -v sha256sum >/dev/null; then
  (cd "$dir" && sha256sum -c SHA256SUMS.tgz)
else
  (cd "$dir" && shasum -a 256 -c SHA256SUMS.tgz)
fi
