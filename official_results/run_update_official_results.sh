#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

cd "$PROJECT_ROOT"

HAS_TRANSPORT=false
for arg in "$@"; do
  case "$arg" in
    --transport|--transport=*)
      HAS_TRANSPORT=true
      ;;
  esac
done

if [ "$HAS_TRANSPORT" = true ]; then
  python3 scripts/update_official_results.py "$@"
else
  python3 scripts/update_official_results.py \
    --transport "${OFFICIAL_RESULTS_TRANSPORT:-auto}" "$@"
fi
