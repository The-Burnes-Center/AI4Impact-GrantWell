#!/usr/bin/env bash
# Cuts a GrantWell release in two steps:
#   scripts/release.sh prepare <version>     Stamps <version> into packages/core, packages/ui and template/,
#                                            and re-packs instances/generic/vendor/. Commit, push, then tag v<version>.
#   scripts/release.sh build <tag> <out dir> Run by release.yml on the tag: rebuilds both .tgz files, requires them
#                                            to equal the committed vendor/, and adds SBOMs and SHA256SUMS.
# Versions are X.Y.Z (from main) or X.Y.Z-rc.N (from staging).
set -euo pipefail

repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
generic="$repo/instances/generic"
semver='^[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$'

usage() {
  echo "Usage: scripts/release.sh prepare <version> | scripts/release.sh build <tag> <out dir>" >&2
  exit 2
}

# Every place a version lives must agree before anything is published.
check_versions() {
  node - "$repo" "$1" <<'EOF'
const fs = require("fs");
const path = require("path");
const [repo, version] = process.argv.slice(2);
const read = (f) => JSON.parse(fs.readFileSync(path.join(repo, f), "utf8"));
const found = {};
for (const pkg of ["core", "ui"]) {
  const lock = read(`packages/${pkg}/package-lock.json`);
  found[`packages/${pkg}/package.json version`] = read(`packages/${pkg}/package.json`).version;
  found[`packages/${pkg}/package-lock.json version`] = lock.packages[""].version;
}
for (const dir of ["template", "instances/generic"]) {
  const deps = read(`${dir}/package.json`).dependencies;
  for (const pkg of ["core", "ui"]) {
    const spec = deps[`grantwell-${pkg}`];
    const m = /^file:vendor\/grantwell-[a-z]+-(.+)\.tgz$/.exec(spec ?? "");
    found[`${dir}/package.json grantwell-${pkg}`] = m ? m[1] : spec;
  }
}
const wrong = Object.entries(found).filter(([, v]) => v !== version);
for (const [where, v] of wrong) console.error(`${where} is ${v}, expected ${version}`);
process.exit(wrong.length ? 1 : 0);
EOF
}

prepare() {
  local version=$1
  if [ -n "$(git -C "$repo" status --porcelain)" ]; then
    echo "The working tree has uncommitted changes; commit or stash them first." >&2
    exit 1
  fi
  for pkg in core ui; do
    (cd "$repo/packages/$pkg" && npm version "$version" --no-git-tag-version --allow-same-version --ignore-scripts >/dev/null)
  done
  node - "$repo/template/package.json" "$version" <<'EOF'
const fs = require("fs");
const [file, version] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
for (const name of ["grantwell-core", "grantwell-ui"]) pkg.dependencies[name] = `file:vendor/${name}-${version}.tgz`;
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
EOF
  "$repo/scripts/pack.sh"
  check_versions "$version"
  git -C "$repo" status --short
  echo
  echo "Stamped $version. Commit these changes and push; once CI passes, tag the commit v$version and push the tag."
}

build() {
  local tag=$1 out=$2
  local version=${tag#v}
  if [ "$tag" = "$version" ] || ! [[ $version =~ $semver ]]; then
    echo "Tag $tag is not vX.Y.Z or vX.Y.Z-rc.N" >&2
    exit 1
  fi
  check_versions "$version"
  if [ -e "$out" ] && [ -n "$(ls -A "$out")" ]; then
    echo "$out is not empty" >&2
    exit 1
  fi
  mkdir -p "$out"
  out=$(realpath "$out")

  "$repo/scripts/pack.sh" "$out"
  for pkg in core ui; do
    file="grantwell-$pkg-$version.tgz"
    if ! cmp -s "$out/$file" "$generic/vendor/$file"; then
      echo "$file built from this commit differs from instances/generic/vendor/$file; re-run scripts/release.sh prepare $version" >&2
      exit 1
    fi
  done

  # Core's devDependencies never reach a state; the UI's do, because every deploy builds it from source.
  (cd "$repo/packages/core" && npm sbom --sbom-format cyclonedx --package-lock-only --omit dev) > "$out/grantwell-core-$version.cdx.json"
  (cd "$repo/packages/ui" && npm sbom --sbom-format cyclonedx --package-lock-only) > "$out/grantwell-ui-$version.cdx.json"
  (cd "$out" && sha256sum grantwell-core-"$version".tgz grantwell-ui-"$version".tgz grantwell-*-"$version".cdx.json > SHA256SUMS)
  cat "$out/SHA256SUMS"
}

case "${1:-}" in
  prepare)
    [ $# -eq 2 ] && [[ $2 =~ $semver ]] || usage
    prepare "$2"
    ;;
  build)
    [ $# -eq 3 ] || usage
    build "$2" "$3"
    ;;
  *) usage ;;
esac
