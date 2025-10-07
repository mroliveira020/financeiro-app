#!/bin/bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$REPO_DIR/backend/venv/bin/activate"

if [ ! -f "$VENV" ]; then
  echo "Ambiente virtual não encontrado em $VENV"
  exit 1
fi

source "$VENV"
python "$REPO_DIR/garimpo/src/principal.py"
