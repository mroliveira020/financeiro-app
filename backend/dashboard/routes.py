from flask import request, jsonify
from flask_cors import cross_origin
from . import dashboard_bp
from config import ALLOWED_ORIGINS_LIST, RATE_LIMIT_EDIT
from security import requires_auth, requires_editor_token, get_current_user
from ratelimit import limiter
from models import (
    listar_lancamentos_incompletos_view,
    listar_lancamentos_completos_view,
    adicionar_lancamentos_em_lote,
    atualizar_lancamentos_em_lote,
    obter_data_ultima_atualizacao,
    listar_ultimos_lancamentos_confirmados,
    listar_totais_mensais_por_imovel,
    listar_detalhes_gastos_mensais,
    listar_transacoes_mensais,
    usuario_participa_imovel,
    listar_imoveis_financeiro_acessiveis,
)


def _usuario_pode_acessar_imovel_financeiro(id_imovel):
    current_user = get_current_user() or {}
    if not current_user:
        return False
    if current_user.get("role") == "admin":
        return True
    return usuario_participa_imovel(id_imovel, current_user.get("id"))


def _ids_imoveis_financeiro_permitidos():
    current_user = get_current_user() or {}
    if not current_user:
        return []
    if current_user.get("role") == "admin":
        return None
    imoveis = listar_imoveis_financeiro_acessiveis(
        viewer_user_id=current_user.get("id"),
        viewer_role=current_user.get("role"),
    )
    return [item.get("id") for item in imoveis if item.get("id") is not None]


def _obter_parametros_paginacao():
    page_size = request.args.get('pageSize', request.args.get('limit', 50))
    page = request.args.get('page', 1)
    return page_size, page


# ==========================================================
# 🔹 Lista de lançamentos incompletos para um imóvel
# ==========================================================
@dashboard_bp.route('/dashboard/lancamentos/incompletos/<int:id_imovel>', methods=['GET'])
@requires_auth
@cross_origin(origins=ALLOWED_ORIGINS_LIST or '*')
def get_lancamentos_incompletos(id_imovel):
    if not _usuario_pode_acessar_imovel_financeiro(id_imovel):
        return jsonify({"error": "Permissão insuficiente para este imóvel"}), 403
    try:
        page_size, page = _obter_parametros_paginacao()
        resultados = listar_lancamentos_incompletos_view(
            id_imovel=id_imovel,
            limit=page_size,
            page=page,
        )
        return jsonify(resultados), 200
    except Exception as e:
        print(f"Erro ao listar incompletos: {e}")
        return jsonify({"error": "Erro ao buscar lançamentos incompletos"}), 500

# ==========================================================
# 🔹 Lista de lançamentos completos para um imóvel
# ==========================================================
@dashboard_bp.route('/dashboard/lancamentos/completos/<int:id_imovel>', methods=['GET'])
@requires_auth
@cross_origin(origins=ALLOWED_ORIGINS_LIST or '*')
def get_lancamentos_completos(id_imovel):
    if not _usuario_pode_acessar_imovel_financeiro(id_imovel):
        return jsonify({"error": "Permissão insuficiente para este imóvel"}), 403
    try:
        page_size, page = _obter_parametros_paginacao()
        resultados = listar_lancamentos_completos_view(
            id_imovel,
            limit=page_size,
            page=page,
        )
        return jsonify(resultados), 200
    except Exception as e:
        print(f"Erro ao listar completos: {e}")
        return jsonify({"error": "Erro ao buscar lançamentos completos"}), 500

# ==========================================================
# 🔹 Adicionar lançamentos em lote
# ==========================================================
@dashboard_bp.route('/dashboard/lancamentos/lote', methods=['POST'])
@cross_origin(origins=ALLOWED_ORIGINS_LIST or '*')
@requires_editor_token
@limiter.limit(RATE_LIMIT_EDIT)
def adicionar_lote_lancamentos():
    novos = request.get_json()

    if not novos or not isinstance(novos, list):
        return jsonify({"error": "Nenhum lançamento recebido ou formato incorreto!"}), 400

    try:
        resultado = adicionar_lancamentos_em_lote(novos)
        return jsonify({
            "message": "Lançamentos adicionados com sucesso!",
            "total": resultado
        }), 201
    except ValueError as e:
        # Erros de validação (ex.: data inválida)
        return jsonify({
            "error": "Dados inválidos no lote. Verifique as datas (use DD/MM/AAAA ou YYYY-MM-DD).",
            "details": str(e)
        }), 400
    except Exception as e:
        print(f"Erro ao adicionar lançamentos em lote: {e}")
        return jsonify({"error": "Erro ao adicionar lançamentos"}), 500


# ==========================================================
# 🔹 Atualizar lançamentos em lote
# ==========================================================
@dashboard_bp.route('/dashboard/lancamentos/batch', methods=['PATCH', 'OPTIONS'])
@cross_origin(origins=ALLOWED_ORIGINS_LIST or '*')
@requires_editor_token
@limiter.limit(RATE_LIMIT_EDIT)
def atualizar_lancamentos_batch():
    if request.method == 'OPTIONS':
        return jsonify({}), 204

    payload = request.get_json(silent=True) or {}
    ids = payload.get('ids')
    updates = payload.get('updates') or {}

    if not isinstance(ids, list) or not ids:
        return jsonify({"error": "Selecione ao menos um lançamento"}), 400

    try:
        total = atualizar_lancamentos_em_lote(ids, updates)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except LookupError as exc:
        return jsonify({"error": str(exc)}), 404
    except Exception as exc:
        print(f"Erro ao atualizar lançamentos em lote: {exc}")
        return jsonify({"error": "Erro ao atualizar lançamentos"}), 500

    return jsonify({"updated": total}), 200

# ==========================================================
# 🔹 Excluir lançamento (completo ou incompleto)
# ==========================================================
@dashboard_bp.route('/dashboard/lancamentos/<int:id_lancamento>', methods=['DELETE', 'OPTIONS'])
@cross_origin(origins=ALLOWED_ORIGINS_LIST or '*')
@requires_editor_token
@limiter.limit(RATE_LIMIT_EDIT)
def excluir_lancamento_incompleto(id_lancamento):
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    try:
        # Importação aqui para evitar conflito circular
        from models import excluir_lancamento

        excluir_lancamento(id_lancamento)
        return jsonify({
            "message": f"Lançamento {id_lancamento} excluído com sucesso!"
        }), 200
    except Exception as e:
        print(f"Erro ao excluir lançamento: {e}")
        return jsonify({"error": "Erro ao excluir lançamento"}), 500

# ==========================================================
# 🔹 Alterar lançamento (completo ou incompleto)
# ==========================================================
@dashboard_bp.route('/dashboard/lancamentos/<int:id_lancamento>', methods=['PATCH', 'OPTIONS'])
@cross_origin(origins=ALLOWED_ORIGINS_LIST or '*')
@requires_editor_token
@limiter.limit(RATE_LIMIT_EDIT)
def alterar_lancamento_incompleto(id_lancamento):
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    data = request.get_json()

    if not data:
        return jsonify({"error": "Dados não recebidos para atualização"}), 400

    try:
        # Importação aqui para evitar conflito circular
        from models import alterar_lancamento

        alterar_lancamento(id_lancamento, data)
        return jsonify({"message": "Lançamento atualizado com sucesso!"}), 200
    except ValueError as e:
        return jsonify({
            "error": "Dados inválidos na atualização. Verifique as datas (use DD/MM/AAAA ou YYYY-MM-DD) e os campos obrigatórios.",
            "details": str(e)
        }), 400
    except Exception as e:
        print(f"Erro ao alterar lançamento: {e}")
        return jsonify({"error": "Erro ao atualizar lançamento"}), 500

# ==========================================================
# 🔹 Rodapé: Data de atualização e últimos lançamentos
# ==========================================================
@dashboard_bp.route('/dashboard/ultima_atualizacao', methods=['GET'])
@requires_auth
@cross_origin(origins=ALLOWED_ORIGINS_LIST or '*')
def get_ultima_atualizacao():
    try:
        data_str = obter_data_ultima_atualizacao(_ids_imoveis_financeiro_permitidos())
        return jsonify({"data": data_str}), 200
    except Exception as e:
        print(f"Erro ao obter data de atualização: {e}")
        return jsonify({"error": "Erro ao obter data de atualização"}), 500


@dashboard_bp.route('/dashboard/ultimos_lancamentos', methods=['GET'])
@requires_auth
@cross_origin(origins=ALLOWED_ORIGINS_LIST or '*')
def get_ultimos_lancamentos():
    try:
        limit = request.args.get('limit', 10)
        itens = listar_ultimos_lancamentos_confirmados(limit, _ids_imoveis_financeiro_permitidos())
        return jsonify(itens), 200
    except Exception as e:
        print(f"Erro ao listar últimos lançamentos: {e}")
        return jsonify({"error": "Erro ao listar últimos lançamentos"}), 500


@dashboard_bp.route('/dashboard/gastos-mensais', methods=['GET'])
@requires_auth
@cross_origin(origins=ALLOWED_ORIGINS_LIST or '*')
def get_gastos_mensais():
    try:
        meses = request.args.get('meses', 6)
        excluir_raw = request.args.get('excluir', '').strip()
        categorias_excluidas = None
        if excluir_raw:
            categorias_excluidas = []
            for parte in excluir_raw.split(','):
                parte = parte.strip()
                if not parte:
                    continue
                try:
                    categorias_excluidas.append(int(parte))
                except Exception:
                    continue

        incluir_vendidos_raw = request.args.get('includeVendidos') or request.args.get('incluir_vendidos')
        incluir_vendidos = True
        if incluir_vendidos_raw is not None:
            incluir_vendidos = incluir_vendidos_raw.lower() in {"1", "true", "t", "yes", "sim"}

        dados = listar_totais_mensais_por_imovel(
            meses,
            categorias_excluidas,
            incluir_vendidos,
            _ids_imoveis_financeiro_permitidos(),
        )
        return jsonify(dados), 200
    except Exception as e:
        print(f"Erro ao listar gastos mensais: {e}")
        return jsonify({"error": "Erro ao listar gastos mensais"}), 500


@dashboard_bp.route('/dashboard/gastos-mensais/detalhes', methods=['GET'])
@requires_auth
@cross_origin(origins=ALLOWED_ORIGINS_LIST or '*')
def get_gastos_mensais_detalhes():
    try:
        imovel_id = request.args.get('imovelId', type=int)
        mes = request.args.get('mes', '').strip()
        if not imovel_id or not mes:
            return jsonify({"error": "Parâmetros 'imovelId' e 'mes' são obrigatórios"}), 400
        if not _usuario_pode_acessar_imovel_financeiro(imovel_id):
            return jsonify({"error": "Permissão insuficiente para este imóvel"}), 403

        excluir_raw = request.args.get('excluir', '').strip()
        categorias_excluidas = None
        if excluir_raw:
            categorias_excluidas = []
            for parte in excluir_raw.split(','):
                parte = parte.strip()
                if not parte:
                    continue
                try:
                    categorias_excluidas.append(int(parte))
                except Exception:
                    continue

        detalhes = listar_detalhes_gastos_mensais(imovel_id, mes, categorias_excluidas)
        return jsonify(detalhes), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        print(f"Erro ao detalhar gastos mensais: {exc}")
        return jsonify({"error": "Erro ao detalhar gastos mensais"}), 500


@dashboard_bp.route('/dashboard/gastos-mensais/transacoes', methods=['GET'])
@requires_auth
@cross_origin(origins=ALLOWED_ORIGINS_LIST or '*')
def get_gastos_mensais_transacoes():
    try:
        imovel_id = request.args.get('imovelId', type=int)
        mes = request.args.get('mes', '').strip()
        categoria_id = request.args.get('categoriaId', type=int)

        if not imovel_id or not mes:
            return jsonify({"error": "Parâmetros 'imovelId' e 'mes' são obrigatórios"}), 400
        if not _usuario_pode_acessar_imovel_financeiro(imovel_id):
            return jsonify({"error": "Permissão insuficiente para este imóvel"}), 403

        transacoes = listar_transacoes_mensais(imovel_id, mes, categoria_id)
        return jsonify(transacoes), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        print(f"Erro ao listar transações mensais: {exc}")
        return jsonify({"error": "Erro ao listar transações"}), 500
