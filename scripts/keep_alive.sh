#!/usr/bin/env bash
set -euo pipefail

# Mantém serviços Render acordados executando requisições simples.
# Permite sobrescrever URLs via variáveis de ambiente.

SITE_HEALTH_URL="${SITE_HEALTH_URL:-https://site-backend-hg4w.onrender.com/healthz}"
FRONTEND_URL="${FRONTEND_URL:-https://financeiro-frontend-hg4w.onrender.com}"
GPT_HEALTH_URL="${GPT_HEALTH_URL:-https://gpt-backend-hg4w.onrender.com/healthz}"

ping_url() {
  local url="$1"
  if [[ -z "$url" ]]; then
    return 0
  fi

  curl --silent --show-error --fail --max-time 20 "$url" > /dev/null && \
    echo "[keep-alive] Ping bem-sucedido: $url" || \
    echo "[keep-alive] Falha ao pingar: $url" >&2
}

ping_url "$SITE_HEALTH_URL"
ping_url "$FRONTEND_URL"
ping_url "$GPT_HEALTH_URL"
