from typing import Any, Dict

from flask import Blueprint, jsonify, request
from psycopg2 import errors
from werkzeug.security import check_password_hash

from models import (
    criar_usuario,
    criar_convite_usuario,
    definir_senha_por_convite,
    listar_usuarios,
    obter_usuario_por_email,
    obter_usuario_por_id,
)
from ratelimit import limiter
from security import generate_access_token, get_current_user, requires_auth, requires_role
from config import FRONTEND_APP_URL

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
    if user.get("password_reset_required"):
        return jsonify({"error": "Defina a senha pelo link de convite enviado pelo administrador"}), 403

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

    if role not in {"viewer", "editor", "admin", "prospector"}:
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


@auth_bp.route("/auth/users", methods=["GET"])
@requires_role("admin")
def list_users() -> Any:
    users = listar_usuarios()
    return jsonify({"data": users}), 200


@auth_bp.route("/auth/users/invite", methods=["POST"])
@requires_role("admin")
def create_user_invite() -> Any:
    payload: Dict[str, Any] = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    role = (payload.get("role") or "prospector").strip().lower()
    is_active = bool(payload.get("is_active", True))
    invite_hours = int(payload.get("invite_hours", 72))

    if role not in {"viewer", "editor", "admin", "prospector"}:
        return jsonify({"error": "Papel inválido"}), 400
    if not email:
        return jsonify({"error": "E-mail é obrigatório"}), 400

    try:
        invited = criar_convite_usuario(
            email=email,
            role=role,
            is_active=is_active,
            invite_hours=invite_hours,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Falha ao gerar convite: {exc}"}), 500

    invite_link = (
        f"{FRONTEND_APP_URL.rstrip('/')}/primeiro-acesso"
        f"?email={invited['email']}&token={invited['invite_token']}"
    )
    return (
        jsonify(
            {
                "user": {
                    "id": invited["id"],
                    "email": invited["email"],
                    "role": invited["role"],
                    "is_active": invited["is_active"],
                    "invite_expires_at": invited.get("invite_expires_at"),
                },
                "invite_link": invite_link,
            }
        ),
        201,
    )


@auth_bp.route("/auth/setup-password", methods=["POST"])
@limiter.limit("20/minute")
def setup_password() -> Any:
    payload: Dict[str, Any] = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    token = (payload.get("token") or "").strip()
    password = payload.get("password") or ""

    try:
        user = definir_senha_por_convite(email=email, token=token, nova_senha=password)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Falha ao definir senha: {exc}"}), 500

    return (
        jsonify(
            {
                "message": "Senha definida com sucesso. Faça login para continuar.",
                "user": user,
            }
        ),
        200,
    )
