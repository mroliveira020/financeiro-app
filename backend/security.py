from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Any, Dict, Optional
import json

import jwt
from flask import g, jsonify, request
from db_connection import conectar

from config import (
    JWT_EXPIRES_MINUTES,
    JWT_SECRET,
    READ_ONLY,
)


class AuthError(Exception):
    def __init__(self, message: str, status_code: int = 401) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


PROSPECTOR_ALLOWED_PREFIXES = ("/prospeccoes", "/auth", "/healthz")
FINANCE_ALLOWED_PREFIXES = (
    "/imoveis",
    "/imoveis-financeiro-acessiveis",
    "/categorias",
    "/lancamentos",
    "/orcamentos",
    "/dashboard",
)


def _log_auth_failure(reason: str, status: int) -> None:
    try:
        ip = (
            request.headers.get("X-Forwarded-For", request.remote_addr or "-")
            .split(",")[0]
            .strip()
        )
        log = {
            "event": "auth_failure",
            "path": request.path,
            "method": request.method,
            "status": status,
            "reason": reason,
            "ip": ip,
            "user_agent": request.headers.get("User-Agent", "-"),
        }
        print(json.dumps(log, ensure_ascii=False))
    except Exception:
        pass


def _get_authorization_token() -> str:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise AuthError("Token ausente", 401)
    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        raise AuthError("Token ausente", 401)
    return token


def _decode_access_token(token: str) -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("Token expirado", 401) from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError("Token inválido", 401) from exc

    if payload.get("type") != "access":
        raise AuthError("Token inválido", 401)

    return {
        "id": payload.get("sub"),
        "email": payload.get("email"),
        "role": payload.get("role", "viewer"),
        "is_active": payload.get("is_active", True),
    }


def _is_allowed_path_for_prospector(path: str) -> bool:
    if not path:
        return False
    normalized = path.rstrip("/") or "/"
    for prefix in PROSPECTOR_ALLOWED_PREFIXES:
        if normalized == prefix or normalized.startswith(prefix + "/"):
            return True
    return False


def _is_allowed_finance_path(path: str) -> bool:
    if not path:
        return False
    normalized = path.rstrip("/") or "/"
    for prefix in FINANCE_ALLOWED_PREFIXES:
        if normalized == prefix or normalized.startswith(prefix + "/"):
            return True
    return False


def user_has_finance_access(user_id: int | None, role: str | None = None) -> bool:
    role_norm = (role or "").strip().lower()
    if role_norm in {"viewer", "editor", "admin"}:
        return True
    if role_norm != "prospector" or not user_id:
        return False

    conn, cur = conectar()
    try:
        cur.execute(
            """
            SELECT 1
            FROM imovel_socios
            WHERE user_id = %s
              AND ativo = TRUE
              AND percentual_participacao > 0
            LIMIT 1
            """,
            (user_id,),
        )
        return bool(cur.fetchone())
    except Exception:
        return False
    finally:
        conn.close()


def _ensure_module_access(user: Dict[str, Any]) -> Optional[tuple]:
    if user.get("role") != "prospector":
        return None
    if _is_allowed_path_for_prospector(request.path):
        return None
    if user_has_finance_access(user.get("id"), user.get("role")) and _is_allowed_finance_path(request.path):
        return None
    _log_auth_failure("Módulo não permitido para este perfil", 403)
    return jsonify({"error": "Permissão insuficiente para este módulo"}), 403


def generate_access_token(user_id: int, email: str, role: str, is_active: bool = True) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRES_MINUTES)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "is_active": is_active,
        "type": "access",
        "exp": expires,
        "iat": datetime.now(timezone.utc),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    return token


def get_current_user() -> Optional[Dict[str, Any]]:
    return getattr(g, "current_user", None)


def _ensure_user_loaded() -> Dict[str, Any]:
    user = get_current_user()
    if user:
        return user

    token = _get_authorization_token()
    user = _decode_access_token(token)
    if not user.get("is_active", True):
        raise AuthError("Usuário inativo", 403)
    g.current_user = user
    return user


def requires_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if request.method == "OPTIONS":
            return ("", 204)
        try:
            user = _ensure_user_loaded()
        except AuthError as exc:
            _log_auth_failure(exc.message, exc.status_code)
            return jsonify({"error": exc.message}), exc.status_code
        access_error = _ensure_module_access(user)
        if access_error:
            return access_error
        return fn(*args, **kwargs)

    return wrapper


def requires_role(*roles: str):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if request.method == "OPTIONS":
                return ("", 204)
            try:
                user = _ensure_user_loaded()
            except AuthError as exc:
                _log_auth_failure(exc.message, exc.status_code)
                return jsonify({"error": exc.message}), exc.status_code
            access_error = _ensure_module_access(user)
            if access_error:
                return access_error

            if user.get("role") not in roles:
                _log_auth_failure("Permissão insuficiente", 403)
                return jsonify({"error": "Permissão insuficiente"}), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def requires_editor_token(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if request.method == "OPTIONS":
            return ("", 204)
        if READ_ONLY:
            path = request.path.rstrip("/")
            if not (
                path.startswith("/dashboard/lancamentos/")
                or path == "/dashboard/lancamentos/lote"
                or path.endswith("/socios")
            ):
                return jsonify({"error": "Somente leitura"}), 405

        try:
            user = _ensure_user_loaded()
        except AuthError as exc:
            _log_auth_failure(exc.message, exc.status_code)
            return jsonify({"error": exc.message}), exc.status_code
        access_error = _ensure_module_access(user)
        if access_error:
            return access_error

        if user.get("role") not in {"editor", "admin"}:
            _log_auth_failure("Permissão insuficiente", 403)
            return jsonify({"error": "Permissão insuficiente"}), 403

        return fn(*args, **kwargs)

    return wrapper


def requires_prospeccao_write(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if request.method == "OPTIONS":
            return ("", 204)

        try:
            user = _ensure_user_loaded()
        except AuthError as exc:
            _log_auth_failure(exc.message, exc.status_code)
            return jsonify({"error": exc.message}), exc.status_code
        access_error = _ensure_module_access(user)
        if access_error:
            return access_error

        if user.get("role") not in {"prospector", "editor", "admin"}:
            _log_auth_failure("Permissão insuficiente", 403)
            return jsonify({"error": "Permissão insuficiente"}), 403

        return fn(*args, **kwargs)

    return wrapper
