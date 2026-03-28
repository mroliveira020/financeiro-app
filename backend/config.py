import os
from dotenv import load_dotenv

# Carregar variáveis de ambiente
load_dotenv()

# Ambiente
APP_ENV = os.getenv("APP_ENV", "development").lower()
DEBUG = os.getenv("DEBUG", "true" if APP_ENV != "production" else "false").lower() == "true"

# Feature flags / segurança
READ_ONLY = os.getenv("READ_ONLY", "false").lower() == "true"
# Em dev, habilita por padrão; em prod, desabilita por padrão
ENABLE_SQL_ENDPOINT = os.getenv(
    "ENABLE_SQL_ENDPOINT",
    "true" if APP_ENV != "production" else "false"
).lower() == "true"

# GPT write API
ENABLE_GPT_WRITE = os.getenv(
    "ENABLE_GPT_WRITE",
    "false"  # desabilitado por padrão
).lower() == "true"
GPT_TOKEN = os.getenv("GPT_TOKEN", "")

# CORS
_default_origins = "*" if APP_ENV != "production" else ""
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", _default_origins)
# Lista de origens (se vazio em prod, ficará lista vazia -> sem permissão)
ALLOWED_ORIGINS_LIST = [o.strip() for o in ALLOWED_ORIGINS.split(",") if o.strip()] if ALLOWED_ORIGINS else []

# Tokens
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")

# Integração Notion (se aplicável)
NOTION_API_KEY = os.getenv("NOTION_API_KEY")
NOTION_DATABASE_ID = os.getenv("NOTION_DATABASE_ID")

HEADERS = {
    "Authorization": f"Bearer {NOTION_API_KEY}",
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28"
}

# Rate limiting e proxy
RATE_LIMIT_STORAGE_URI = os.getenv("RATE_LIMIT_STORAGE_URI", "memory://")
RATE_LIMIT_EDIT = os.getenv("RATE_LIMIT_EDIT", "30/minute")
RATE_LIMIT_ADMIN = os.getenv("RATE_LIMIT_ADMIN", "10/minute")
RATE_LIMIT_GLOBAL = os.getenv("RATE_LIMIT_GLOBAL", "")
TRUST_PROXY = os.getenv("TRUST_PROXY", "true" if APP_ENV == "production" else "false").lower() == "true"
RATE_LIMIT_GPT_WRITE = os.getenv("RATE_LIMIT_GPT_WRITE", "20/minute")

# Search API (auxiliar para o agente)
ENABLE_SEARCH_API = os.getenv("ENABLE_SEARCH_API", "true").lower() == "true"
RATE_LIMIT_SEARCH = os.getenv("RATE_LIMIT_SEARCH", "60/minute")

# Autenticação de usuários
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "720"))

# Observabilidade / performance
PERF_WARN_THRESHOLD_MS = int(os.getenv("PERF_WARN_THRESHOLD_MS", "700"))

# URL pública do frontend (usada para geração de links de convite)
FRONTEND_APP_URL = os.getenv("FRONTEND_APP_URL", "http://localhost:5173")
