#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${ROOT_DIR}/backend/venv"
GARIMPO_DIR="${ROOT_DIR}/garimpo"

echo "[garimpo:init] Iniciando preparo do ambiente"

if [ ! -d "${VENV_DIR}" ]; then
  echo "[garimpo:init] Criando venv em backend/venv"
  python3 -m venv "${VENV_DIR}"
fi

source "${VENV_DIR}/bin/activate"

REQ_FILE_BACKEND="${ROOT_DIR}/backend/requirements.txt"
if [ -f "${REQ_FILE_BACKEND}" ]; then
  echo "[garimpo:init] Instalando dependências do backend (venv compartilhado)"
  pip install -r "${REQ_FILE_BACKEND}"
fi

REQ_FILE_GARIMPO="${GARIMPO_DIR}/requirements.txt"
if [ -f "${REQ_FILE_GARIMPO}" ]; then
  echo "[garimpo:init] Instalando dependências específicas do garimpo"
  pip install -r "${REQ_FILE_GARIMPO}"
fi

CONFIG_FILE="${GARIMPO_DIR}/config.yaml"
CONFIG_EXAMPLE="${GARIMPO_DIR}/config.yaml.example"
if [ ! -f "${CONFIG_FILE}" ] && [ -f "${CONFIG_EXAMPLE}" ]; then
  echo "[garimpo:init] Criando config padrão a partir do exemplo"
  cp "${CONFIG_EXAMPLE}" "${CONFIG_FILE}"
fi

echo "[garimpo:init] Ambiente pronto."
echo "Para executar: bash garimpo/start.sh [principal|extrajudicial_caixa]"
