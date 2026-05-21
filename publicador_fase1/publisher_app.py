#!/usr/bin/env python3
"""Tiny expiring file publisher.

Serves files under the workspace published/ directory via tokenized URLs.
Tokens expire after TTL seconds.

Security model:
- Only serves files that exist in PUBLISHED_DIR, or content explicitly uploaded
  through the authenticated /publish endpoint
- Token is required
- Token maps to a single filename

This is intended for low-volume internal use (Telegram group). Put behind a
reverse proxy/HTTPS if needed.
"""

from __future__ import annotations

import json
import hashlib
import os
import subprocess
import time
import secrets
from pathlib import Path
from dataclasses import dataclass
from typing import Any, Dict

from flask import Flask, abort, send_from_directory, jsonify, request


def load_env_file(path: str) -> None:
    try:
        lines = open(path, encoding="utf-8").read().splitlines()
    except OSError:
        return
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env_file("/root/.openclaw/secrets/publisher.env")

WORKSPACE_ROOT = os.environ.get("WORKSPACE_ROOT", str(Path(__file__).resolve().parent))
PUBLISHED_DIR = os.environ.get("PUBLISHED_DIR", str(Path(WORKSPACE_ROOT) / "published"))
DEFAULT_TTL = int(os.environ.get("DEFAULT_TTL", "86400"))
MAX_PUBLISHED_FILE_AGE_SECONDS = int(os.environ.get("MAX_PUBLISHED_FILE_AGE_SECONDS", str(24 * 60 * 60)))
TOKEN_STORE_PATH = Path(os.environ.get("PUBLISH_TOKEN_STORE_PATH", str(Path(WORKSPACE_ROOT) / "memory" / "publisher-tokens.json")))
SESSION_STORE_PATH = Path(os.environ.get("DASHBOARD_SESSION_STORE_PATH", str(Path(WORKSPACE_ROOT) / "memory" / "financeiro-familiar-dashboard-sessions.json")))

app = Flask(__name__)


@dataclass
class TokenEntry:
    filename: str
    expires_at: float
    meta: dict[str, Any] | None = None


TOKENS: Dict[str, TokenEntry] = {}
DASHBOARD_SESSIONS: Dict[str, dict[str, Any]] = {}
FAMILIAR_SCRIPT = os.path.join(WORKSPACE_ROOT, "scripts", "financeiro_familiar_lancamento.py")
TEMP_FILE_PREFIXES = ("financeiro_familiar_dashboard_", "financeiro_familiar_lote_")


def _is_temp_file(filename: str) -> bool:
    return filename.endswith(".html") and filename.startswith(TEMP_FILE_PREFIXES)


def _published_path(filename: str) -> Path:
    return Path(PUBLISHED_DIR) / filename


def _temp_file_age(filename: str, now: float) -> float | None:
    if not _is_temp_file(filename):
        return None
    try:
        return now - _published_path(filename).stat().st_mtime
    except OSError:
        return None


def _delete_temp_file(filename: str) -> None:
    if not _is_temp_file(filename):
        return
    try:
        _published_path(filename).unlink(missing_ok=True)
    except OSError:
        pass


def _load_tokens() -> dict[str, TokenEntry]:
    try:
        data = json.loads(TOKEN_STORE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    now = time.time()
    loaded: dict[str, TokenEntry] = {}
    for token, item in data.items():
        if not isinstance(item, dict):
            continue
        filename = str(item.get("filename") or "")
        try:
            expires_at = float(item.get("expires_at") or 0)
        except (TypeError, ValueError):
            expires_at = 0
        meta = item.get("meta") if isinstance(item.get("meta"), dict) else None
        if filename and expires_at > now:
            loaded[str(token)] = TokenEntry(filename=filename, expires_at=expires_at, meta=meta)
    return loaded


def _save_tokens() -> None:
    try:
        TOKEN_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        data = {
            token: {"filename": entry.filename, "expires_at": entry.expires_at, "meta": entry.meta}
            for token, entry in TOKENS.items()
        }
        TOKEN_STORE_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except Exception:
        pass


def _token_entry(token: str) -> TokenEntry | None:
    ent = TOKENS.get(token)
    if ent:
        return ent
    TOKENS.update(_load_tokens())
    return TOKENS.get(token)


def _load_dashboard_sessions() -> dict[str, dict[str, Any]]:
    try:
        data = json.loads(SESSION_STORE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _save_dashboard_sessions() -> None:
    try:
        SESSION_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        SESSION_STORE_PATH.write_text(json.dumps(DASHBOARD_SESSIONS, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except Exception:
        pass


def _set_dashboard_session(token: str, session: dict[str, Any]) -> None:
    DASHBOARD_SESSIONS[token] = session
    _save_dashboard_sessions()


def _pop_dashboard_session(token: str) -> None:
    DASHBOARD_SESSIONS.pop(token, None)
    _save_dashboard_sessions()


def _dashboard_session(token: str) -> dict[str, Any] | None:
    session = DASHBOARD_SESSIONS.get(token)
    if session:
        return session
    DASHBOARD_SESSIONS.update(_load_dashboard_sessions())
    return DASHBOARD_SESSIONS.get(token)


def _gc():
    now = time.time()
    dead = [
        t
        for t, e in TOKENS.items()
        if e.expires_at <= now or (_temp_file_age(e.filename, now) or 0) > MAX_PUBLISHED_FILE_AGE_SECONDS
    ]
    for t in dead:
        entry = TOKENS.pop(t, None)
        if entry:
            _delete_temp_file(entry.filename)
        DASHBOARD_SESSIONS.pop(t, None)
    if dead:
        _save_tokens()
        _save_dashboard_sessions()
    published = Path(PUBLISHED_DIR)
    try:
        files = list(published.iterdir())
    except OSError:
        return
    for path in files:
        if not path.is_file() or not _is_temp_file(path.name):
            continue
        try:
            if now - path.stat().st_mtime > MAX_PUBLISHED_FILE_AGE_SECONDS:
                path.unlink(missing_ok=True)
        except OSError:
            pass


def _dashboard_entry(token: str) -> TokenEntry:
    _gc()
    ent = _token_entry(token)
    if not ent:
        abort(404)
    if not ent.filename.startswith("financeiro_familiar_dashboard_"):
        abort(403)
    return ent


def _marker_message(marker: str, payload: dict[str, Any]) -> str:
    intro = "Editar lançamento familiar" if marker == "PEDIDO_EDICAO_FAMILIAR" else "Incluir lote familiar"
    return "\n".join([intro, "", marker, "```json", json.dumps(payload, ensure_ascii=False), "```"])


def _run_familiar_script(args: list[str]) -> dict[str, Any]:
    proc = subprocess.run(
        ["python3", FAMILIAR_SCRIPT, *args],
        cwd=WORKSPACE_ROOT,
        text=True,
        capture_output=True,
        timeout=60,
        check=False,
    )
    try:
        data = json.loads((proc.stdout or "").strip() or "{}")
    except json.JSONDecodeError:
        data = {"action": "error", "message": (proc.stdout or proc.stderr or "Resposta inválida do backend.")[:500]}
    if proc.returncode != 0:
        message = data.get("message") if isinstance(data, dict) else ""
        raise RuntimeError(str(message or proc.stderr or "Falha ao preparar a operação."))
    return data if isinstance(data, dict) else {"action": "error", "message": "Resposta inválida do backend."}


def _dashboard_preview(draft: dict[str, Any]) -> dict[str, Any]:
    if draft.get("waiting_for") == "fatura_confirmation":
        rows = []
        for item in draft.get("previews") or []:
            if not isinstance(item, dict):
                continue
            rows.append(
                {
                    "id": item.get("id") or "",
                    "data": item.get("data") or "",
                    "descricao": item.get("descricao") or "",
                    "valor": item.get("valor") or "",
                    "categoria": item.get("categoria") or "",
                    "conta": item.get("conta") or "",
                    "usuario": item.get("usuario") or "",
                }
            )
        return {
            "kind": "statement",
            "rows": rows,
            "summary": {
                "conta": draft.get("conta_nome") or "",
                "periodo": f"{draft.get('fatura_periodo_inicio') or ''} a {draft.get('fatura_periodo_fim') or ''}",
                "vencimento": draft.get("fatura_vencimento") or "",
                "valor_fatura": draft.get("valor_fatura") or "",
                "valor_lancamentos": draft.get("valor_lancamentos") or "",
                "diferenca": draft.get("diferenca") or "",
            },
            "reconciliation": draft.get("conferencia_fatura") if isinstance(draft.get("conferencia_fatura"), dict) else {},
        }
    if draft.get("waiting_for") == "batch_confirmation":
        rows = []
        for index, item in enumerate(draft.get("previews") or [], 1):
            if not isinstance(item, dict):
                continue
            rows.append(
                {
                    "index": index,
                    "data": item.get("data") or "",
                    "descricao": item.get("descricao") or "",
                    "valor": item.get("valor") or "",
                    "categoria": item.get("categoria") or "",
                    "conta": item.get("conta") or "",
                    "usuario": item.get("usuario") or "",
                }
            )
        return {"kind": "insert", "rows": rows}
    if draft.get("waiting_for") == "edit_confirmation":
        rows = []
        for item in draft.get("changes") or []:
            if not isinstance(item, dict):
                continue
            fields = item.get("fields") if isinstance(item.get("fields"), dict) else item
            rows.append(
                {
                    "id": item.get("id") or "",
                    "data": fields.get("data") or "",
                    "descricao": fields.get("descricao") or "",
                    "valor": fields.get("valor") or "",
                    "categoria": fields.get("categoria_id") or "",
                    "conta": fields.get("conta_id") or "",
                    "usuario": fields.get("usuario_lancamento_id") or "",
                }
            )
        return {"kind": "edit", "rows": rows}
    return {"kind": "text", "rows": []}


def _token_fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]


@app.get("/health")
def health():
    _gc()
    return {"ok": True, "tokens": len(TOKENS)}


@app.post("/publish")
def publish():
    # simple shared secret auth
    secret = os.environ.get("PUBLISH_SECRET")
    if os.environ.get("APP_ENV") == "production" and not secret:
        abort(500)
    if secret:
        got = request.headers.get("x-publish-secret")
        if got != secret:
            abort(401)

    _gc()
    data = request.get_json(force=True, silent=False)
    filename = data.get("filename")
    ttl = min(int(data.get("ttl", DEFAULT_TTL)), MAX_PUBLISHED_FILE_AGE_SECONDS)
    if not filename or "/" in filename or ".." in filename:
        abort(400)

    content = data.get("content")
    full = os.path.join(PUBLISHED_DIR, filename)
    if content is not None:
        if not isinstance(content, str):
            abort(400)
        os.makedirs(PUBLISHED_DIR, exist_ok=True)
        Path(full).write_text(content, encoding="utf-8")
    elif not os.path.isfile(full):
        abort(404)

    token = secrets.token_urlsafe(24)
    meta = data.get("meta") if isinstance(data.get("meta"), dict) else None
    TOKENS[token] = TokenEntry(filename=filename, expires_at=time.time() + ttl, meta=meta)
    _save_tokens()

    base_url = os.environ.get("PUBLIC_BASE_URL", "")
    url = f"{base_url}/f/{token}" if base_url else f"/f/{token}"
    return jsonify({"token": token, "url": url, "expires_in": ttl})


@app.get("/f/<token>")
def fetch(token: str):
    _gc()
    ent = _token_entry(token)
    if not ent:
        abort(404)
    inline_html = ent.filename.lower().endswith(".html")
    return send_from_directory(PUBLISHED_DIR, ent.filename, as_attachment=not inline_html)


@app.post("/financeiro-familiar/dashboard/prepare")
def financeiro_familiar_dashboard_prepare():
    data = request.get_json(force=True, silent=False)
    token = str(data.get("token") or "")
    ent = _dashboard_entry(token)
    marker = str(data.get("marker") or "")
    if marker not in {"PEDIDO_EDICAO_FAMILIAR", "PEDIDO_INCLUSAO_LOTE_FAMILIAR"}:
        abort(400)
    payload = data.get("payload")
    if not isinstance(payload, dict):
        abort(400)
    chat_id = str((ent.meta or {}).get("telegram_chat_id") or "")
    args = ["--message", _marker_message(marker, payload)]
    if chat_id:
        args.extend(["--telegram-chat-id", chat_id])
    try:
        result = _run_familiar_script(args)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"action": "error", "message": str(exc)}), 400
    draft = result.get("draft") if isinstance(result.get("draft"), dict) else None
    if not draft or result.get("action") != "ask_confirmation":
        return jsonify(result), 400
    confirmation_id = secrets.token_urlsafe(16)
    session_id = secrets.token_urlsafe(12)
    _set_dashboard_session(token, {
        "confirmation_id": confirmation_id,
        "session_id": session_id,
        "token_fingerprint": _token_fingerprint(token),
        "draft": draft,
        "chat_id": chat_id,
        "prepared_at": time.time(),
    })
    return jsonify(
        {
            "action": "prepared",
            "message": result.get("message") or "Operação preparada.",
            "preview": _dashboard_preview(draft),
            "confirmation_id": confirmation_id,
        }
    )


@app.post("/financeiro-familiar/dashboard/statement/prepare")
def financeiro_familiar_dashboard_statement_prepare():
    data = request.get_json(force=True, silent=False)
    token = str(data.get("token") or "")
    ent = _dashboard_entry(token)
    payload = data.get("payload")
    if not isinstance(payload, dict):
        abort(400)
    chat_id = str((ent.meta or {}).get("telegram_chat_id") or "")
    args = ["--prepare-statement-json", json.dumps(payload, ensure_ascii=False)]
    if chat_id:
        args.extend(["--telegram-chat-id", chat_id])
    try:
        result = _run_familiar_script(args)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"action": "error", "message": str(exc)}), 400
    draft = result.get("draft") if isinstance(result.get("draft"), dict) else None
    if not draft or result.get("action") != "ask_confirmation":
        return jsonify(result), 400
    confirmation_id = secrets.token_urlsafe(16)
    session_id = secrets.token_urlsafe(12)
    _set_dashboard_session(token, {
        "confirmation_id": confirmation_id,
        "session_id": session_id,
        "token_fingerprint": _token_fingerprint(token),
        "draft": draft,
        "chat_id": chat_id,
        "prepared_at": time.time(),
    })
    return jsonify(
        {
            "action": "prepared",
            "message": result.get("message") or "Fechamento preparado.",
            "preview": _dashboard_preview(draft),
            "confirmation_id": confirmation_id,
        }
    )


@app.get("/financeiro-familiar/dashboard/data")
def financeiro_familiar_dashboard_data():
    token = str(request.args.get("token") or "")
    ent = _dashboard_entry(token)
    meta = ent.meta or {}
    start = str(meta.get("dashboard_start") or "")
    end = str(meta.get("dashboard_end") or "")
    label = str(meta.get("dashboard_label") or "")
    chat_id = str(meta.get("telegram_chat_id") or "")
    if not start or not end:
        return jsonify({"action": "error", "message": "Este link foi gerado antes do refresh dinâmico. Gere um novo link financeiro."}), 409
    args = ["--dashboard-data", "--dashboard-start", start, "--dashboard-end", end, "--dashboard-label", label]
    if chat_id:
        args.extend(["--telegram-chat-id", chat_id])
    try:
        result = _run_familiar_script(args)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"action": "error", "message": str(exc)}), 400
    return jsonify(result)


@app.post("/financeiro-familiar/dashboard/commit")
def financeiro_familiar_dashboard_commit():
    data = request.get_json(force=True, silent=False)
    token = str(data.get("token") or "")
    _dashboard_entry(token)
    session = _dashboard_session(token)
    if not session or session.get("confirmation_id") != str(data.get("confirmation_id") or ""):
        return jsonify({"action": "error", "message": "Confirmação expirada ou já usada. Clique em Revisar fatura/Preparar novamente e confirme de novo."}), 409
    audit_session = f"session:{session.get('session_id')};token_sha256:{session.get('token_fingerprint')}"
    args = [
        "--commit",
        "--draft-json",
        json.dumps(session["draft"], ensure_ascii=False),
        "--audit-origin",
        "dashboard",
        "--audit-session",
        audit_session,
    ]
    if session.get("chat_id"):
        args.extend(["--telegram-chat-id", str(session["chat_id"])])
        args.extend(["--audit-requested-by", f"telegram:{session['chat_id']}"])
    try:
        result = _run_familiar_script(args)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"action": "error", "message": str(exc)}), 400
    _pop_dashboard_session(token)
    return jsonify(result)


@app.get("/financeiro-familiar/dashboard/card-configs")
def financeiro_familiar_dashboard_card_configs():
    token = str(request.args.get("token") or "")
    ent = _dashboard_entry(token)
    chat_id = str((ent.meta or {}).get("telegram_chat_id") or "")
    args = ["--card-configs"]
    if chat_id:
        args.extend(["--telegram-chat-id", chat_id])
    try:
        result = _run_familiar_script(args)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"action": "error", "message": str(exc)}), 400
    return jsonify(result)


@app.post("/financeiro-familiar/dashboard/card-configs")
def financeiro_familiar_dashboard_save_card_config():
    data = request.get_json(force=True, silent=False)
    token = str(data.get("token") or "")
    ent = _dashboard_entry(token)
    payload = data.get("payload")
    if not isinstance(payload, dict):
        abort(400)
    chat_id = str((ent.meta or {}).get("telegram_chat_id") or "")
    args = ["--save-card-config-json", json.dumps(payload, ensure_ascii=False)]
    if chat_id:
        args.extend(["--telegram-chat-id", chat_id])
    try:
        result = _run_familiar_script(args)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"action": "error", "message": str(exc)}), 400
    return jsonify(result)


@app.get("/financeiro-familiar/dashboard/accounts")
def financeiro_familiar_dashboard_accounts():
    token = str(request.args.get("token") or "")
    ent = _dashboard_entry(token)
    chat_id = str((ent.meta or {}).get("telegram_chat_id") or "")
    args = ["--accounts-admin"]
    if chat_id:
        args.extend(["--telegram-chat-id", chat_id])
    try:
        result = _run_familiar_script(args)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"action": "error", "message": str(exc)}), 400
    return jsonify(result)


@app.post("/financeiro-familiar/dashboard/accounts")
def financeiro_familiar_dashboard_save_account():
    data = request.get_json(force=True, silent=False)
    token = str(data.get("token") or "")
    ent = _dashboard_entry(token)
    payload = data.get("payload")
    if not isinstance(payload, dict):
        abort(400)
    chat_id = str((ent.meta or {}).get("telegram_chat_id") or "")
    args = ["--save-account-json", json.dumps(payload, ensure_ascii=False)]
    if chat_id:
        args.extend(["--telegram-chat-id", chat_id])
    try:
        result = _run_familiar_script(args)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"action": "error", "message": str(exc)}), 400
    return jsonify(result)


@app.get("/financeiro-familiar/dashboard/categories")
def financeiro_familiar_dashboard_categories():
    token = str(request.args.get("token") or "")
    ent = _dashboard_entry(token)
    chat_id = str((ent.meta or {}).get("telegram_chat_id") or "")
    args = ["--categories-admin"]
    if chat_id:
        args.extend(["--telegram-chat-id", chat_id])
    try:
        result = _run_familiar_script(args)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"action": "error", "message": str(exc)}), 400
    return jsonify(result)


@app.post("/financeiro-familiar/dashboard/categories")
def financeiro_familiar_dashboard_save_category():
    data = request.get_json(force=True, silent=False)
    token = str(data.get("token") or "")
    ent = _dashboard_entry(token)
    payload = data.get("payload")
    if not isinstance(payload, dict):
        abort(400)
    chat_id = str((ent.meta or {}).get("telegram_chat_id") or "")
    args = ["--save-category-json", json.dumps(payload, ensure_ascii=False)]
    if chat_id:
        args.extend(["--telegram-chat-id", chat_id])
    try:
        result = _run_familiar_script(args)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"action": "error", "message": str(exc)}), 400
    return jsonify(result)


if __name__ == "__main__":
    os.makedirs(PUBLISHED_DIR, exist_ok=True)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8099")))
