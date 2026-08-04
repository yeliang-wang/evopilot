#!/usr/bin/env bash
set -euo pipefail

VERSION="${EVOPILOT_INSTALL_VERSION:-1.0.10}"
DIR="${EVOPILOT_INSTALL_DIR:-evopilot-stack}"
PACKAGE="${EVOPILOT_INSTALL_PACKAGE:-create-evopilot}"
MANIFEST_URL="${EVOPILOT_INSTALL_MANIFEST_URL:-https://raw.githubusercontent.com/yeliang-wang/evopilot/v${VERSION}/installers/manifest.json}"
START=0
FORCE=0
SKIP_VERIFY=0
SKIP_MANIFEST=0
DRY_RUN=0
EXTRA_ARGS=()

usage() {
  cat <<USAGE
EvoPilot self-host installer

Usage:
  install.sh [--dir evopilot-stack] [--start] [--force] [--skip-verify] [--skip-manifest] [--dry-run]

Environment:
  EVOPILOT_INSTALL_VERSION       create-evopilot version. Default: ${VERSION}
  EVOPILOT_INSTALL_DIR           output directory. Default: ${DIR}
  EVOPILOT_INSTALL_PACKAGE       npm package name. Default: ${PACKAGE}
  EVOPILOT_INSTALL_MANIFEST_URL  release manifest URL. Default: ${MANIFEST_URL}
  EVOPILOT_LLM_BASE_URL          used by --start validation when creating .env
  EVOPILOT_LLM_MODEL_NAME        used by --start validation when creating .env
  EVOPILOT_LLM_API_KEY           used by --start validation when creating .env
USAGE
}

fail() {
  echo "install.sh: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required. Install Node.js 22+ and curl before running this installer."
}

node_major() {
  node -p "Number(process.versions.node.split('.')[0])"
}

download_manifest() {
  if [ "$SKIP_MANIFEST" -eq 1 ]; then
    return
  fi
  local manifest_file
  manifest_file="$(mktemp)"
  if ! curl -fsSL "$MANIFEST_URL" -o "$manifest_file"; then
    rm -f "$manifest_file"
    fail "could not download release manifest: ${MANIFEST_URL}. Use --skip-manifest only for an explicitly reviewed offline install."
  fi
  node - "$manifest_file" "$VERSION" "$PACKAGE" <<'NODE'
const fs = require("node:fs");
const [manifestPath, version, packageName] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.version !== version) {
  throw new Error(`manifest version ${manifest.version} does not match installer version ${version}`);
}
const entry = manifest.packages?.[packageName];
if (!entry || entry.version !== version) {
  throw new Error(`manifest package ${packageName} does not pin version ${version}`);
}
if (!manifest.installers?.["install.sh"]?.sha256) {
  throw new Error("manifest must include install.sh checksum");
}
NODE
  rm -f "$manifest_file"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dir)
      DIR="${2:?--dir requires a value}"
      shift 2
      ;;
    --manifest-url)
      MANIFEST_URL="${2:?--manifest-url requires a value}"
      shift 2
      ;;
    --package)
      PACKAGE="${2:?--package requires a value}"
      shift 2
      ;;
    --start)
      START=1
      shift
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --skip-verify)
      SKIP_VERIFY=1
      shift
      ;;
    --skip-manifest)
      SKIP_MANIFEST=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      EXTRA_ARGS+=("$1")
      shift
      ;;
  esac
done

require_command node
require_command npm
require_command curl

if [ "$(node_major)" -lt 22 ]; then
  fail "Node.js 22+ is required. Current version: $(node -v)"
fi

download_manifest

ARGS=(self-host --dir "$DIR" --init-env)
if [ "$START" -eq 1 ]; then
  ARGS+=(--start)
fi
if [ "$FORCE" -eq 1 ]; then
  ARGS+=(--force)
fi
if [ "$SKIP_VERIFY" -eq 1 ]; then
  ARGS+=(--skip-verify)
fi
if [ "${#EXTRA_ARGS[@]}" -gt 0 ]; then
  ARGS+=("${EXTRA_ARGS[@]}")
fi

if [ "$DRY_RUN" -eq 1 ]; then
  printf 'npx --yes %q' "${PACKAGE}@${VERSION}"
  printf ' %q' "${ARGS[@]}"
  printf '\n'
  exit 0
fi

npx --yes "${PACKAGE}@${VERSION}" "${ARGS[@]}"
