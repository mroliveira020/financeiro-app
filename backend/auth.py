from typing import Any, Dict

from flask import Blueprint, jsonify, request
from psycopg2 import errors
from werkzeug.security import check_password_hash

from models import (
    criar_usuario,
    obter_usuario_por_email,
    obter_usuario_por_id,
)
from ratelimit import limiter
from security import generate_access_token, get_current_user, requires_auth, requires_role

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/auth/login", methods=["POST"])
@limiter.limit("10/minute")
def login() -> Any:
    payload: Dict[str, Any] = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Credenciais obrigatórias"}), 400

    user = obter_usuario_por_email(email)
    if not user:
        return jsonify({"error": "Credenciais inválidas"}), 401
    if not user.get("is_active", True):
        return jsonify({"error": "Usuário inativo"}), 403

    if not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Credenciais inválidas"}), 401

    token = generate_access_token(
        user_id=user["id"],
        email=user["email"],
        role=user.get("role", "viewer"),
        is_active=user.get("is_active", True),
    )
    return (
        jsonify(
            {
                "token": token,
                "user": {
                    "id": user["id"],
                    "email": user["email"],
                    "role": user.get("role", "viewer"),
                },
            }
        ),
        200,
    )


@auth_bp.route("/auth/me", methods=["GET"])
@requires_auth
def me() -> Any:
    current = get_current_user()
    if not current:
        return jsonify({"error": "Não autenticado"}), 401

    db_user = obter_usuario_por_id(current["id"])
    if not db_user or not db_user.get("is_active", True):
        return jsonify({"error": "Usuário inativo ou não encontrado"}), 403

    return (
        jsonify(
            {
                "id": db_user["id"],
                "email": db_user["email"],
                "role": db_user.get("role", "viewer"),
            }
        ),
        200,
    )


@auth_bp.route("/auth/logout", methods=["POST"])
@requires_auth
def logout() -> Any:
    # Stateless: apenas instruímos o cliente a descartar o token
    return jsonify({"message": "Logout efetuado"}), 200


@auth_bp.route("/auth/users", methods=["POST"])
@requires_role("admin")
def create_user() -> Any:
    payload: Dict[str, Any] = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    role = (payload.get("role") or "viewer").strip().lower()
    is_active = bool(payload.get("is_active", True))

    if role not in {"viewer", "editor", "admin"}:
        return jsonify({"error": "Papel inválido"}), 400
    if not email or not password:
        return jsonify({"error": "E-mail e senha são obrigatórios"}), 400

    try:
        user = criar_usuario(email=email, senha=password, role=role, is_active=is_active)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except errors.UniqueViolation:
        return jsonify({"error": "E-mail já cadastrado"}), 409
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Falha ao criar usuário: {exc}"}), 500

    return (
        jsonify(
            {
                "id": user["id"],
                "email": user["email"],
                "role": user.get("role", "viewer"),
                "is_active": user.get("is_active", True),
            }
        ),
        201,
    )
