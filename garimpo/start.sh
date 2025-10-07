#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GARIMPO_DIR="${ROOT_DIR}/garimpo"
VENV_PATH="${ROOT_DIR}/backend/venv"

echo "[garimpo] Preparando ambiente..."

if [ ! -d "${VENV_PATH}" ]; then
    echo "[garimpo] ERRO: ambiente virtual do backend não encontrado em backend/venv."
    echo "[garimpo] Execute 'bash backend/start.sh' para criar o venv e tente novamente."
    exit 1
fi

source "${VENV_PATH}/bin/activate"

REQ_FILE="${GARIMPO_DIR}/requirements.txt"
if [ -f "${REQ_FILE}" ]; then
    echo "[garimpo] Instalando dependências específicas..."
    pip install -r "${REQ_FILE}"
fi

export PYTHONPATH="${GARIMPO_DIR}/src:${PYTHONPATH:-}"

SCRIPT_NAME="${1:-principal}"
case "${SCRIPT_NAME}" in
    principal|extrajudicial_caixa)
        TARGET_SCRIPT="${GARIMPO_DIR}/src/${SCRIPT_NAME}.py"
        shift || true
        ;;
    *)
        echo "[garimpo] Uso: bash garimpo/start.sh [principal|extrajudicial_caixa] [args...]"
        exit 1
        ;;
esac

CONFIG_FILE="${GARIMPO_DIR}/config.yaml"
if [ ! -f "${CONFIG_FILE}" ] && [ -f "${CONFIG_FILE}.example" ]; then
    echo "[garimpo] AVISO: copie '${CONFIG_FILE}.example' para '${CONFIG_FILE}' antes de executar."
fi

echo "[garimpo] Executando: python ${TARGET_SCRIPT} $*"
python "${TARGET_SCRIPT}" "$@"
