#!/usr/bin/env bash
set -euo pipefail

VERSION="${EVOPILOT_INSTALL_VERSION:-1.0.8}"
DIR="${EVOPILOT_INSTALL_DIR:-evopilot-stack}"
START=0
FORCE=0
SKIP_VERIFY=0
EXTRA_ARGS=()

usage() {
  cat <<USAGE
EvoPilot self-host installer

Usage:
  install.sh [--dir evopilot-stack] [--start] [--force] [--skip-verify]

Environment:
  EVOPILOT_INSTALL_VERSION   create-evopilot version. Default: ${VERSION}
  EVOPILOT_INSTALL_DIR       output directory. Default: ${DIR}
  EVOPILOT_LLM_BASE_URL      used by --start validation when creating .env
  EVOPILOT_LLM_MODEL_NAME    used by --start validation when creating .env
  EVOPILOT_LLM_API_KEY       used by --start validation when creating .env
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dir)
      DIR="${2:?--dir requires a value}"
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

if ! command -v npm >/dev/null 2>&1; then
  echo "install.sh: npm is required. Install Node.js 22+ before running this installer." >&2
  exit 1
fi

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
ARGS+=("${EXTRA_ARGS[@]}")

npx --yes "create-evopilot@${VERSION}" "${ARGS[@]}"
