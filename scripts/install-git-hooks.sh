#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK_SRC="${ROOT_DIR}/scripts/git-hooks/pre-commit"
HOOK_DST="${ROOT_DIR}/.git/hooks/pre-commit"

if [ ! -d "${ROOT_DIR}/.git" ]; then
  echo "Repositório Git não encontrado em ${ROOT_DIR}."
  exit 1
fi

if [ ! -f "${HOOK_SRC}" ]; then
  echo "Hook de origem não encontrado: ${HOOK_SRC}"
  exit 1
fi

install -m 0755 "${HOOK_SRC}" "${HOOK_DST}"
echo "Hook instalado em ${HOOK_DST}"
