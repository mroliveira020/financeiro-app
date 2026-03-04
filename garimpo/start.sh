#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GARIMPO_DIR="${ROOT_DIR}/garimpo"
VENV_PATH="${ROOT_DIR}/backend/venv"
ENV_FILE="${GARIMPO_DIR}/.env"

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

if [ -f "${ENV_FILE}" ]; then
    echo "[garimpo] Carregando variáveis locais de ${ENV_FILE}"
    set -a
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
    set +a
else
    echo "[garimpo] AVISO: arquivo ${ENV_FILE} não encontrado (ok se usar apenas config.yaml)."
fi

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

clean_cfg_value() {
    local value="${1:-}"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    echo "${value}"
}

read_supabase_cfg_field() {
    local field="$1"
    local raw
    raw="$(awk -v key="${field}" '
        BEGIN { in_supabase = 0 }
        /^supabase:/ { in_supabase = 1; next }
        in_supabase && /^[^[:space:]]/ { in_supabase = 0 }
        in_supabase && $1 == key ":" {
            $1 = ""
            sub(/^[[:space:]]+/, "", $0)
            print $0
            exit
        }
    ' "${CONFIG_FILE}" 2>/dev/null || true)"
    clean_cfg_value "${raw}"
}

is_true() {
    case "${1,,}" in
        true|1|yes|y|sim|s) return 0 ;;
        *) return 1 ;;
    esac
}

validate_supabase_requirements() {
    local cfg_enabled cfg_url cfg_service_key effective_url effective_service_key
    cfg_enabled="$(read_supabase_cfg_field "enabled")"
    cfg_url="$(read_supabase_cfg_field "url")"
    cfg_service_key="$(read_supabase_cfg_field "service_role_key")"

    if ! is_true "${cfg_enabled}"; then
        return 0
    fi

    effective_url="${SUPABASE_URL:-${cfg_url:-}}"
    effective_service_key="${SUPABASE_SERVICE_KEY:-${cfg_service_key:-}}"

    if [ -z "${effective_url}" ] || [ -z "${effective_service_key}" ]; then
        echo "[garimpo] ERRO: Supabase habilitado, mas faltam variáveis obrigatórias."
        echo "[garimpo] Defina em ${ENV_FILE} (ou exporte no shell):"
        echo "[garimpo]   SUPABASE_URL=..."
        echo "[garimpo]   SUPABASE_SERVICE_KEY=..."
        exit 1
    fi
}

validate_supabase_requirements

echo "[garimpo] Executando: python ${TARGET_SCRIPT} $*"
python "${TARGET_SCRIPT}" "$@"
