from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Any, Dict, Optional

import jwt
from flask import g, jsonify, request

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
        try:
            _ensure_user_loaded()
        except AuthError as exc:
            return jsonify({"error": exc.message}), exc.status_code
        return fn(*args, **kwargs)

    return wrapper


def requires_role(*roles: str):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            try:
                user = _ensure_user_loaded()
            except AuthError as exc:
                return jsonify({"error": exc.message}), exc.status_code

            if user.get("role") not in roles:
                return jsonify({"error": "Permissão insuficiente"}), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def requires_editor_token(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if READ_ONLY:
            return jsonify({"error": "Somente leitura"}), 405

        try:
            user = _ensure_user_loaded()
        except AuthError as exc:
            return jsonify({"error": exc.message}), exc.status_code

        if user.get("role") not in {"editor", "admin"}:
            return jsonify({"error": "Permissão insuficiente"}), 403

        return fn(*args, **kwargs)

    return wrapper
