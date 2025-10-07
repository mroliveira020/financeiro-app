from flask import Blueprint, request, jsonify
from db_connection import conectar
from ratelimit import limiter
from config import RATE_LIMIT_SEARCH, ALLOWED_ORIGINS_LIST
from security import requires_auth
from flask_cors import CORS

search_bp = Blueprint('search', __name__)
CORS(search_bp, resources={r"/*": {"origins": ALLOWED_ORIGINS_LIST or "*"}})


def _paginate_params():
    try:
        limit = int(request.args.get('limit', 10))
    except Exception:
        limit = 10
    try:
        offset = int(request.args.get('offset', 0))
    except Exception:
        offset = 0
    # bounds
    if limit < 1:
        limit = 1
    if limit > 50:
        limit = 50
    if offset < 0:
        offset = 0
    return limit, offset


@search_bp.route('/imoveis/search', methods=['GET'])
@requires_auth
@limiter.limit(RATE_LIMIT_SEARCH)
def search_imoveis():
    q = request.args.get('q', '').strip()
    limit, offset = _paginate_params()

    conn, cur = conectar()
    try:
        if q:
            cur.execute(
                """
                SELECT id, nome
                FROM imoveis
                WHERE nome ILIKE %s
                ORDER BY nome
                LIMIT %s OFFSET %s
                """,
                (f"%{q}%", limit, offset),
            )
        else:
            cur.execute(
                """
                SELECT id, nome
                FROM imoveis
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                (limit, offset),
            )
        rows = cur.fetchall()
        itens = [{"id": r[0], "nome": r[1]} for r in rows]
        return jsonify(itens), 200
    finally:
        conn.close()


@search_bp.route('/categorias/search', methods=['GET'])
@requires_auth
@limiter.limit(RATE_LIMIT_SEARCH)
def search_categorias():
    q = request.args.get('q', '').strip()
    limit, offset = _paginate_params()

    conn, cur = conectar()
    try:
        if q:
            cur.execute(
                """
                SELECT id, categoria
                FROM categorias
                WHERE categoria ILIKE %s
                ORDER BY categoria
                LIMIT %s OFFSET %s
                """,
                (f"%{q}%", limit, offset),
            )
        else:
            cur.execute(
                """
                SELECT id, categoria
                FROM categorias
                ORDER BY categoria
                LIMIT %s OFFSET %s
                """,
                (limit, offset),
            )
        rows = cur.fetchall()
        itens = [{"id": r[0], "categoria": r[1]} for r in rows]
        return jsonify(itens), 200
    finally:
        conn.close()
