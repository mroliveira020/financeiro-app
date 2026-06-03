from flask import Flask, request, jsonify
from flask import send_file, abort
from flask_cors import CORS
from auth import auth_bp
from dashboard import dashboard_bp
from models import (
    listar_imoveis,
    adicionar_imovel,
    atualizar_imovel,
    deletar_imovel,
    buscar_imovel_por_id,
    listar_categorias,
    adicionar_categoria,
    deletar_categoria,
    listar_lancamentos,
    #adicionar_lancamento,
    adicionar_lancamentos_em_lote,
    listar_resumo_financeiro,
    listar_resumo_imoveis,
    listar_orcamentos_por_imovel,
    atualizar_inserir_orcamentos,
    listar_prospeccoes_capturados,
    listar_prospeccoes_selecionados,
    inserir_prospeccao_selecionado,
    excluir_prospeccao_selecionado,
    buscar_autoria_prospeccao_selecionado,
    buscar_contexto_operacao_prospeccao_capturado,
    buscar_contexto_operacao_prospeccao_selecionado,
    listar_prospeccoes_meta,
    obter_analise_prospeccao_selecionado,
    obter_avaliacao_automatica_prospeccao,
    salvar_analise_prospeccao_selecionado,
    salvar_score_regiao_avaliacao,
    listar_prospectores_ativos,
    salvar_responsaveis_prospeccao_selecionado,
    obter_ai_analise_prospeccao_selecionado,
    salvar_ai_analise_prospeccao_selecionado,
    criar_job_ai_prospeccao,
    obter_job_ai_prospeccao,
    obter_usuario_por_id,
    listar_socios_imovel,
    salvar_socios_imovel,
    obter_posicao_financeira_compartilhada,
    usuario_participa_imovel,
    listar_imoveis_financeiro_acessiveis,
    listar_ultimos_lancamentos_confirmados,
    listar_totais_mensais_por_imovel,
    obter_data_ultima_atualizacao,
)
from analytics import analytics_bp
from gpt import gpt_bp
from search import search_bp
from config import (
    APP_ENV,
    DEBUG,
    READ_ONLY,
    ENABLE_SQL_ENDPOINT,
    ALLOWED_ORIGINS_LIST,
    RATE_LIMIT_STORAGE_URI,
    RATE_LIMIT_GLOBAL,
    RATE_LIMIT_EDIT,
    TRUST_PROXY,
    PERF_WARN_THRESHOLD_MS,
)
from security import requires_auth, requires_editor_token, requires_prospeccao_write, get_current_user
from ratelimit import limiter
from werkzeug.middleware.proxy_fix import ProxyFix
import time, json
import os
import requests as _req
from flask import g
from werkzeug.exceptions import HTTPException


app = Flask(__name__)
# Proxy IP fix para uso por trás de proxy (Render)
if TRUST_PROXY:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1)
# Configura CORS conforme origens permitidas
cors_resources = None
if ALLOWED_ORIGINS_LIST:
    cors_resources = {r"/*": {"origins": ALLOWED_ORIGINS_LIST}}
elif APP_ENV != "production":
    cors_resources = {r"/*": {"origins": "*"}}
else:
    app.logger.warning("cors_disabled_missing_allowed_origins")

if cors_resources:
    CORS(app, resources=cors_resources)


def _ids_imoveis_financeiro_permitidos(current_user):
    if not current_user:
        return []
    if current_user.get("role") == "admin":
        return None
    imoveis = listar_imoveis_financeiro_acessiveis(
        viewer_user_id=current_user.get("id"),
        viewer_role=current_user.get("role"),
    )
    return [item.get("id") for item in imoveis if item.get("id") is not None]

# Inicializa rate limiter com storage e limite global opcional (Flask-Limiter v3)
default_limits = [RATE_LIMIT_GLOBAL] if RATE_LIMIT_GLOBAL else None
app.config['RATELIMIT_STORAGE_URI'] = RATE_LIMIT_STORAGE_URI
if default_limits:
    app.config['RATELIMIT_DEFAULTS'] = default_limits
limiter.init_app(app)

# Registra analytics somente se habilitado
if ENABLE_SQL_ENDPOINT:
    app.register_blueprint(analytics_bp)

# Blueprint GPT (escrita programática)
from config import ENABLE_GPT_WRITE
if ENABLE_GPT_WRITE:
    app.register_blueprint(gpt_bp)

# Search API (auxiliar) — habilitável por flag
from config import ENABLE_SEARCH_API
if ENABLE_SEARCH_API:
    app.register_blueprint(search_bp)

# Autenticação de usuários
app.register_blueprint(auth_bp)

# =====================================================
# 🔹 HEALTHCHECK
# =====================================================

@app.route("/healthz", methods=["GET"]) 
def healthz():
    return jsonify({"status": "ok"}), 200


# =====================================================
# =====================================================
# 🔹 ROTAS IMÓVEIS
# =====================================================

@app.before_request
def enforce_read_only():
    # Permite rotas operacionais específicas mesmo com READ_ONLY habilitado.
    if READ_ONLY and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        path = request.path.rstrip("/")
        if (
            path == "/sql"
            or path.startswith("/gpt/")
            or path.startswith("/auth/")
            or path.startswith("/prospeccoes/")
            or path == "/imoveis"
            or path.startswith("/imoveis/")
            or path.startswith("/orcamentos/")
            or path.startswith("/dashboard/lancamentos/")
            or path == "/dashboard/lancamentos/lote"
            or path.endswith("/socios")
        ):
            return None
        return jsonify({"error": "Modo somente leitura"}), 405


@app.before_request
def start_timer():
    g._start_time = time.perf_counter()


@app.after_request
def audit_log(response):
    try:
        method = request.method
        path = request.path
        is_write = method in {"POST", "PUT", "PATCH", "DELETE"}
        is_admin = path.startswith("/sql") or path.startswith("/analise/")

        duration_ms = None
        try:
            duration_ms = round((time.perf_counter() - getattr(g, "_start_time", time.perf_counter())) * 1000, 2)
        except Exception:
            pass

        if is_write or is_admin:
            hdr_auth = request.headers.get("Authorization", "")
            has_editor = hdr_auth.startswith("Bearer ")
            ip = request.headers.get("X-Forwarded-For", request.remote_addr or "-").split(",")[0].strip()
            ua = request.headers.get("User-Agent", "-")
            body_size = 0
            keys = []
            try:
                data = request.get_json(silent=True)
                if isinstance(data, (dict, list)):
                    body_size = len(json.dumps(data))
                    if isinstance(data, dict):
                        keys = list(data.keys())[:12]
                    else:
                        keys = ["list"]
            except Exception:
                pass

            log = {
                "event": "audit",
                "method": method,
                "path": path,
                "status": response.status_code,
                "duration_ms": duration_ms,
                "ip": ip,
                "ua": ua,
                "body_size": body_size,
                "json_keys": keys,
                "editor_token_present": has_editor,
            }
            print(json.dumps(log, ensure_ascii=False))
        elif duration_ms is not None and duration_ms >= PERF_WARN_THRESHOLD_MS:
            log = {
                "event": "perf",
                "method": method,
                "path": path,
                "status": response.status_code,
                "duration_ms": duration_ms,
            }
            print(json.dumps(log, ensure_ascii=False))
    except Exception:
        pass
    return response


@app.errorhandler(Exception)
def handle_exceptions(e):
    # Mantém HTTPExceptions (com status específico)
    if isinstance(e, HTTPException):
        return e
    # Em produção, não vazar detalhes
    if not DEBUG:
        return jsonify({"error": "Erro interno do servidor"}), 500
    # Em dev, retornar mensagem
    return jsonify({"error": str(e)}), 500

@app.route("/imoveis", methods=["GET"])
@requires_auth
def get_imoveis():
    return jsonify(listar_imoveis())


@app.route("/imoveis-financeiro-acessiveis", methods=["GET"])
@requires_auth
def get_imoveis_financeiro_acessiveis():
    current_user = get_current_user() or {}
    try:
        dados = listar_imoveis_financeiro_acessiveis(
            viewer_user_id=current_user.get("id"),
            viewer_role=current_user.get("role"),
        )
        return jsonify(dados), 200
    except Exception as exc:
        print(f"Erro ao buscar imóveis acessíveis do financeiro: {exc}")
        return jsonify({"error": "Erro ao buscar imóveis acessíveis"}), 500

@app.route("/imoveis", methods=["POST"])
@requires_editor_token
@limiter.limit(RATE_LIMIT_EDIT)
def add_imovel():
    data = request.json
    return jsonify(adicionar_imovel(data["nome"], data["vendido"]))

@app.route("/imoveis/<int:imovel_id>", methods=["GET"])
@requires_auth
def get_imovel_by_id(imovel_id):
    current_user = get_current_user() or {}
    if not _usuario_pode_ver_financeiro_compartilhado(imovel_id, current_user):
        return jsonify({"error": "Permissão insuficiente para este imóvel"}), 403
    imovel = buscar_imovel_por_id(imovel_id)
    if not imovel:
        return jsonify({"error": "Imóvel não encontrado"}), 404
    return jsonify(imovel)


# =====================================================
# 🔹 PROSPECÇÕES (Supabase)
# =====================================================


@app.route("/prospeccoes/capturados", methods=["GET"])
@requires_auth
def get_prospeccoes_capturados():
    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 50))
        ufs = request.args.getlist("uf")
        fontes = request.args.getlist("fonte")
        modalidades = request.args.getlist("modalidade")
        status_list = request.args.getlist("status")
        financia_list = request.args.getlist("financia")
        cidades = request.args.getlist("cidade")
        order_by = request.args.get("order_by", "coletado_em")
        order_dir = request.args.get("order_dir", "desc")
        score_min = request.args.get("score_min", type=int)
        roi_min = request.args.get("roi_min", type=float)
        somente_com_avaliacao = request.args.get("somente_com_avaliacao", "").lower() in {"1", "true", "sim", "yes"}
    except ValueError:
        return jsonify({"error": "Parâmetros inválidos"}), 400

    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    offset = (page - 1) * page_size

    result = listar_prospeccoes_capturados(
        limit=page_size,
        offset=offset,
        ufs=ufs or None,
        fontes=fontes or None,
        modalidades=modalidades or None,
        status=status_list or ["disponivel"],
        financia=financia_list or None,
        cidades=cidades or None,
        order_by=order_by,
        order_dir=order_dir,
        score_min=score_min,
        roi_min=roi_min,
        somente_com_avaliacao=somente_com_avaliacao,
    )
    return jsonify({
        "data": result["data"],
        "total": result["total"],
        "page": page,
        "page_size": page_size,
    })


@app.route("/prospeccoes/selecionados", methods=["GET"])
@requires_auth
def get_prospeccoes_selecionados():
    current_user = get_current_user() or {}
    status = request.args.get("status")
    uf = request.args.get("uf")
    related_user_id = request.args.get("user_id")
    incluir_inativos = (request.args.get("incluir_inativos") or "").strip().lower() in {"1", "true", "sim", "yes"}
    if current_user.get("role") != "admin":
        related_user_id = None
        incluir_inativos = False
    dados = listar_prospeccoes_selecionados(
        status=status,
        uf=uf,
        viewer_user_id=current_user.get("id"),
        viewer_role=current_user.get("role"),
        related_user_id=related_user_id,
        incluir_inativos=incluir_inativos,
    )
    return jsonify({"data": dados})


def _usuario_pode_operar_prospeccao(contexto, current_user):
    if not contexto or not current_user:
        return False
    role = current_user.get("role")
    if role == "admin":
        return True
    current_user_id = current_user.get("id")
    if current_user_id is None:
        return False
    if contexto.get("created_by") == current_user_id:
        return True
    return current_user_id in set(contexto.get("responsavel_ids") or [])


def _usuario_pode_ver_prospeccao(contexto, current_user):
    return _usuario_pode_operar_prospeccao(contexto, current_user)


def _usuario_tem_ai_access(current_user):
    if not current_user:
        return False
    if current_user.get("role") == "admin":
        return True
    user_id = current_user.get("id")
    if not user_id:
        return False
    usuario = obter_usuario_por_id(user_id)
    return bool(usuario and usuario.get("ai_access"))


def _sinalizar_mac_mini():
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        app.logger.warning(
            "ia_signal_skipped_missing_telegram_config",
            extra={"has_token": bool(token), "has_chat_id": bool(chat_id)},
        )
        return False
    try:
        _req.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": "__jobs__"},
            timeout=5,
        )
        return True
    except Exception:
        app.logger.exception("ia_signal_failed")
        return False


def _buscar_contexto_ai_prospeccao(numero_bem, origem):
    if origem == "selecionados":
        return buscar_contexto_operacao_prospeccao_selecionado(numero_bem)
    if origem == "capturados":
        return buscar_contexto_operacao_prospeccao_capturado(numero_bem)
    return None


def _usuario_pode_ver_ai_prospeccao(contexto, current_user, origem):
    if origem == "selecionados":
        return _usuario_pode_ver_prospeccao(contexto, current_user)
    return bool(current_user)


def _resposta_erro_origem_ai(origem):
    if origem == "capturados":
        return "Imóvel não encontrado em capturados"
    return "Imóvel não encontrado em selecionados"


def _get_ai_analise_prospeccao(numero_bem, origem):
    current_user = get_current_user() or {}
    contexto = _buscar_contexto_ai_prospeccao(numero_bem, origem)
    if not contexto:
        return jsonify({"error": _resposta_erro_origem_ai(origem)}), 404
    if not _usuario_pode_ver_ai_prospeccao(contexto, current_user, origem):
        return jsonify({"error": "Você não tem permissão para visualizar a análise deste imóvel."}), 403
    return jsonify(obter_ai_analise_prospeccao_selecionado(numero_bem)), 200


def _put_ai_analise_prospeccao(numero_bem, origem):
    current_user = get_current_user() or {}
    contexto = _buscar_contexto_ai_prospeccao(numero_bem, origem)
    if not contexto:
        return jsonify({"error": _resposta_erro_origem_ai(origem)}), 404
    if not _usuario_pode_ver_ai_prospeccao(contexto, current_user, origem):
        return jsonify({"error": "Você não tem permissão para editar a análise deste imóvel."}), 403

    payload = request.get_json(force=True, silent=True) or {}
    result = salvar_ai_analise_prospeccao_selecionado(
        numero_bem,
        analise_texto=(payload.get("analise_texto") or "").strip() or None,
    )
    return jsonify(result), 200


def _post_ai_analise_chat_prospeccao(numero_bem, origem):
    current_user = get_current_user() or {}
    contexto = _buscar_contexto_ai_prospeccao(numero_bem, origem)
    if not contexto:
        return jsonify({"error": _resposta_erro_origem_ai(origem)}), 404
    if not _usuario_pode_ver_ai_prospeccao(contexto, current_user, origem):
        return jsonify({"error": "Você não tem permissão para acessar a análise deste imóvel."}), 403
    if not _usuario_tem_ai_access(current_user):
        return jsonify({"error": "Seu usuário não possui acesso ao chat de IA."}), 403

    payload = request.get_json(force=True, silent=True) or {}
    mensagem = (payload.get("mensagem") or "").strip()
    if not mensagem:
        return jsonify({"error": "mensagem é obrigatória"}), 400

    job = criar_job_ai_prospeccao(
        numero_bem,
        "chat",
        {
            "mensagem": mensagem,
            "requested_by": {
                "id": current_user.get("id"),
                "name": current_user.get("name") or current_user.get("email"),
                "role": current_user.get("role"),
            },
            "origem": origem,
        },
    )
    sinalizado = _sinalizar_mac_mini()
    app.logger.info(
        "ai_chat_job_requested",
        extra={
            "numero_bem": numero_bem,
            "origem": origem,
            "job_id": job["job_id"],
            "job_status": job["status"],
            "requested_by": current_user.get("id"),
            "signal_sent": sinalizado,
        },
    )
    return jsonify({"job_id": job["job_id"], "status": job["status"]}), 202


def _get_ai_analise_job_prospeccao(numero_bem, job_id, origem):
    current_user = get_current_user() or {}
    contexto = _buscar_contexto_ai_prospeccao(numero_bem, origem)
    if not contexto:
        return jsonify({"error": _resposta_erro_origem_ai(origem)}), 404
    if not _usuario_pode_ver_ai_prospeccao(contexto, current_user, origem):
        return jsonify({"error": "Você não tem permissão para visualizar a análise deste imóvel."}), 403

    job = obter_job_ai_prospeccao(job_id, numero_bem=numero_bem)
    if not job:
        app.logger.warning(
            "ai_job_not_found",
            extra={"numero_bem": numero_bem, "origem": origem, "job_id": job_id},
        )
        return jsonify({"error": "Job não encontrado"}), 404
    if job.get("status") in {"error", "failed"}:
        app.logger.warning(
            "ai_job_failed",
            extra={
                "numero_bem": numero_bem,
                "origem": origem,
                "job_id": job_id,
                "job_status": job.get("status"),
                "job_type": job.get("tipo"),
                "erro": job.get("erro"),
            },
        )
    return jsonify(job), 200


def _post_matricula_prospeccao(numero_bem, origem):
    current_user = get_current_user() or {}
    contexto = _buscar_contexto_ai_prospeccao(numero_bem, origem)
    if not contexto:
        return jsonify({"error": _resposta_erro_origem_ai(origem)}), 404
    if not _usuario_pode_ver_ai_prospeccao(contexto, current_user, origem):
        return jsonify({"error": "Você não tem permissão para acessar a matrícula deste imóvel."}), 403
    if not _usuario_tem_ai_access(current_user):
        return jsonify({"error": "Seu usuário não possui acesso à análise de matrícula."}), 403

    job = criar_job_ai_prospeccao(
        numero_bem,
        "matricula",
        {
            "requested_by": {
                "id": current_user.get("id"),
                "name": current_user.get("name") or current_user.get("email"),
                "role": current_user.get("role"),
            },
            "origem": origem,
        },
    )
    sinalizado = _sinalizar_mac_mini()
    app.logger.info(
        "ai_matricula_job_requested",
        extra={
            "numero_bem": numero_bem,
            "origem": origem,
            "job_id": job["job_id"],
            "job_status": job["status"],
            "requested_by": current_user.get("id"),
            "signal_sent": sinalizado,
        },
    )
    return jsonify({"job_id": job["job_id"], "status": job["status"]}), 202


@app.route("/prospeccoes/selecionados", methods=["POST"])
@requires_prospeccao_write
@limiter.limit(RATE_LIMIT_EDIT)
def post_prospeccoes_selecionados():
    payload = request.get_json(force=True, silent=True) or {}
    current_user = get_current_user() or {}
    numero_bem = payload.get("numero_bem")
    if not numero_bem:
        return jsonify({"error": "numero_bem é obrigatório"}), 400
    contexto = buscar_contexto_operacao_prospeccao_selecionado(numero_bem)
    if contexto and contexto.get("ativo", True) and not _usuario_pode_operar_prospeccao(contexto, current_user):
        return jsonify({"error": "Você não tem permissão para atualizar este imóvel selecionado."}), 403
    status = payload.get("status") or "candidato"
    valor_maximo = payload.get("valor_maximo")
    prioridade = payload.get("prioridade")
    observacoes = payload.get("observacoes")
    result = inserir_prospeccao_selecionado(
        numero_bem,
        status,
        valor_maximo,
        prioridade,
        observacoes,
        created_by=current_user.get("id"),
        created_by_name=current_user.get("name") or current_user.get("email"),
    )
    return jsonify(result), 201


@app.route("/prospeccoes/responsaveis", methods=["GET"])
@requires_auth
def get_prospeccoes_responsaveis():
    current_user = get_current_user() or {}
    if current_user.get("role") != "admin":
        return jsonify({"error": "Apenas administradores podem gerenciar responsáveis."}), 403
    return jsonify({"data": listar_prospectores_ativos()}), 200


@app.route("/prospeccoes/selecionados/<numero_bem>", methods=["DELETE"])
@requires_prospeccao_write
@limiter.limit(RATE_LIMIT_EDIT)
def delete_prospeccoes_selecionados(numero_bem):
    if not numero_bem:
        return jsonify({"error": "numero_bem é obrigatório"}), 400
    current_user = get_current_user() or {}
    autoria = buscar_autoria_prospeccao_selecionado(numero_bem)
    if not autoria:
        return jsonify({"deleted": False, "numero_bem": numero_bem, "message": "Imóvel não encontrado em selecionados"}), 404
    if not autoria.get("ativo", True):
        return jsonify({"deleted": False, "numero_bem": numero_bem, "message": "Imóvel já está fora da fila de selecionados"}), 404

    is_admin = current_user.get("role") == "admin"
    is_author = autoria.get("created_by") is not None and autoria.get("created_by") == current_user.get("id")
    if not is_admin and not is_author:
        return jsonify({"error": "Apenas o autor da seleção ou um administrador pode remover este imóvel."}), 403

    result = excluir_prospeccao_selecionado(
        numero_bem,
        inativado_por=current_user.get("id"),
        inativado_por_name=current_user.get("name") or current_user.get("email"),
    )
    if not result.get("deleted"):
        return jsonify(result), 404
    return jsonify(result), 200


@app.route("/prospeccoes/meta", methods=["GET"])
@requires_auth
def get_prospeccoes_meta():
    return jsonify(listar_prospeccoes_meta())


@app.route("/prospeccoes/capturados/<numero_bem>/avaliacao", methods=["GET"])
@requires_auth
def get_prospeccao_capturado_avaliacao(numero_bem):
    if not numero_bem:
        return jsonify({"error": "numero_bem é obrigatório"}), 400
    result = obter_avaliacao_automatica_prospeccao(numero_bem)
    if not result:
        return jsonify({"error": "Imóvel não encontrado"}), 404
    return jsonify(result), 200


@app.route("/prospeccoes/capturados/<numero_bem>/score-regiao", methods=["PATCH"])
@requires_prospeccao_write
@limiter.limit(RATE_LIMIT_EDIT)
def patch_prospeccao_capturado_score_regiao(numero_bem):
    if not numero_bem:
        return jsonify({"error": "numero_bem é obrigatório"}), 400
    payload = request.get_json(force=True, silent=True) or {}
    score_regiao = payload.get("score_regiao")
    if score_regiao is None:
        return jsonify({"error": "score_regiao é obrigatório"}), 400
    try:
        result = salvar_score_regiao_avaliacao(numero_bem, score_regiao)
    except (TypeError, ValueError):
        return jsonify({"error": "score_regiao deve ser um número entre 0 e 20"}), 400
    if not result:
        return jsonify({"error": "Avaliação automática não encontrada para este imóvel"}), 404
    return jsonify(result), 200


@app.route("/prospeccoes/selecionados/<numero_bem>/analise", methods=["GET"])
@requires_auth
def get_prospeccao_selecionado_analise(numero_bem):
    if not numero_bem:
        return jsonify({"error": "numero_bem é obrigatório"}), 400
    current_user = get_current_user() or {}
    contexto = buscar_contexto_operacao_prospeccao_selecionado(numero_bem)
    if not contexto:
        return jsonify({"error": "Imóvel não encontrado em selecionados"}), 404
    if not _usuario_pode_operar_prospeccao(contexto, current_user):
        return jsonify({"error": "Você não tem permissão para visualizar a análise deste imóvel."}), 403
    result = obter_analise_prospeccao_selecionado(numero_bem)
    if not result:
        return jsonify({"error": "Imóvel não encontrado em selecionados"}), 404
    return jsonify(result), 200


@app.route("/prospeccoes/selecionados/<numero_bem>/analise", methods=["PUT"])
@requires_prospeccao_write
@limiter.limit(RATE_LIMIT_EDIT)
def put_prospeccao_selecionado_analise(numero_bem):
    if not numero_bem:
        return jsonify({"error": "numero_bem é obrigatório"}), 400

    payload = request.get_json(force=True, silent=True) or {}
    current_user = get_current_user() or {}
    contexto = buscar_contexto_operacao_prospeccao_selecionado(numero_bem)
    if not contexto:
        return jsonify({"error": "Imóvel não encontrado em selecionados"}), 404
    if not _usuario_pode_operar_prospeccao(contexto, current_user):
        return jsonify({"error": "Você não tem permissão para editar a análise deste imóvel."}), 403
    result = salvar_analise_prospeccao_selecionado(
        numero_bem,
        payload,
        current_user_id=current_user.get("id"),
        current_user_name=current_user.get("name") or current_user.get("email"),
    )
    if not result:
        return jsonify({"error": "Imóvel não encontrado em selecionados"}), 404
    return jsonify(result), 200


@app.route("/prospeccoes/selecionados/<numero_bem>/ai-analise", methods=["GET"])
@requires_auth
def get_prospeccao_selecionado_ai_analise(numero_bem):
    return _get_ai_analise_prospeccao(numero_bem, "selecionados")


@app.route("/prospeccoes/selecionados/<numero_bem>/ai-analise", methods=["PUT"])
@requires_auth
@limiter.limit(RATE_LIMIT_EDIT)
def put_prospeccao_selecionado_ai_analise(numero_bem):
    return _put_ai_analise_prospeccao(numero_bem, "selecionados")


@app.route("/prospeccoes/selecionados/<numero_bem>/ai-analise/chat", methods=["POST"])
@requires_auth
@limiter.limit(RATE_LIMIT_EDIT)
def post_prospeccao_selecionado_ai_analise_chat(numero_bem):
    return _post_ai_analise_chat_prospeccao(numero_bem, "selecionados")


@app.route("/prospeccoes/selecionados/<numero_bem>/ai-analise/job/<job_id>", methods=["GET"])
@requires_auth
def get_prospeccao_selecionado_ai_analise_job(numero_bem, job_id):
    return _get_ai_analise_job_prospeccao(numero_bem, job_id, "selecionados")


@app.route("/prospeccoes/selecionados/<numero_bem>/matricula", methods=["POST"])
@requires_auth
@limiter.limit(RATE_LIMIT_EDIT)
def post_prospeccao_selecionado_matricula(numero_bem):
    return _post_matricula_prospeccao(numero_bem, "selecionados")


@app.route("/prospeccoes/capturados/<numero_bem>/ai-analise", methods=["GET"])
@requires_auth
def get_prospeccao_capturado_ai_analise(numero_bem):
    return _get_ai_analise_prospeccao(numero_bem, "capturados")


@app.route("/prospeccoes/capturados/<numero_bem>/ai-analise", methods=["PUT"])
@requires_auth
@limiter.limit(RATE_LIMIT_EDIT)
def put_prospeccao_capturado_ai_analise(numero_bem):
    return _put_ai_analise_prospeccao(numero_bem, "capturados")


@app.route("/prospeccoes/capturados/<numero_bem>/ai-analise/chat", methods=["POST"])
@requires_auth
@limiter.limit(RATE_LIMIT_EDIT)
def post_prospeccao_capturado_ai_analise_chat(numero_bem):
    return _post_ai_analise_chat_prospeccao(numero_bem, "capturados")


@app.route("/prospeccoes/capturados/<numero_bem>/ai-analise/job/<job_id>", methods=["GET"])
@requires_auth
def get_prospeccao_capturado_ai_analise_job(numero_bem, job_id):
    return _get_ai_analise_job_prospeccao(numero_bem, job_id, "capturados")


@app.route("/prospeccoes/capturados/<numero_bem>/matricula", methods=["POST"])
@requires_auth
@limiter.limit(RATE_LIMIT_EDIT)
def post_prospeccao_capturado_matricula(numero_bem):
    return _post_matricula_prospeccao(numero_bem, "capturados")


@app.route("/prospeccoes/selecionados/<numero_bem>/responsaveis", methods=["PUT"])
@requires_auth
@limiter.limit(RATE_LIMIT_EDIT)
def put_prospeccoes_selecionados_responsaveis(numero_bem):
    current_user = get_current_user() or {}
    if current_user.get("role") != "admin":
        return jsonify({"error": "Apenas administradores podem atribuir responsáveis."}), 403
    payload = request.get_json(force=True, silent=True) or {}
    user_ids = payload.get("user_ids") or []
    try:
        result = salvar_responsaveis_prospeccao_selecionado(
            numero_bem,
            user_ids,
            assigned_by=current_user.get("id"),
            assigned_by_name=current_user.get("name") or current_user.get("email"),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not result:
        return jsonify({"error": "Imóvel não encontrado em selecionados"}), 404
    return jsonify(result), 200

@app.route("/imoveis/<int:imovel_id>", methods=["PATCH"])
@requires_editor_token
@limiter.limit(RATE_LIMIT_EDIT)
def update_imovel(imovel_id):
    data = request.json
    imovel = buscar_imovel_por_id(imovel_id)
    if not imovel:
        return jsonify({"error": "Imóvel não encontrado"}), 404

    nome = data.get("nome", imovel["nome"])
    vendido = data.get("vendido", imovel["vendido"])
    endereco = data.get("endereco", imovel["endereco"])
    nome_ocupante = data.get("nome_ocupante", imovel["nome_ocupante"])
    cpf_ocupante = data.get("cpf_ocupante", imovel["cpf_ocupante"])
    latitude = data.get("latitude", imovel["latitude"])
    longitude = data.get("longitude", imovel["longitude"])
    corretagem = data.get("corretagem", imovel.get("corretagem", 0))
    ganho_capital = data.get("ganho_capital", imovel.get("ganho_capital", 0))
    valor_venda = data.get("valor_venda", imovel.get("valor_venda", 0))
    foto_base64 = data.get("foto_base64")
    remover_foto = bool(data.get("remover_foto"))

    imovel_atualizado = atualizar_imovel(
        imovel_id,
        nome,
        vendido,
        endereco,
        nome_ocupante,
        cpf_ocupante,
        latitude,
        longitude,
        corretagem,
        ganho_capital,
        valor_venda,
        foto_base64,
        remover_foto,
    )

    return jsonify(imovel_atualizado)

@app.route("/imoveis/<int:imovel_id>", methods=["DELETE"])
@requires_editor_token
@limiter.limit(RATE_LIMIT_EDIT)
def delete_imovel(imovel_id):
    return jsonify(deletar_imovel(imovel_id))


def _usuario_pode_ver_financeiro_compartilhado(imovel_id, current_user):
    if not current_user:
        return False
    if current_user.get("role") == "admin":
        return True
    return usuario_participa_imovel(imovel_id, current_user.get("id"))


def _usuario_pode_escrever_financeiro_compartilhado(imovel_id, current_user):
    if not current_user:
        return False
    if current_user.get("role") == "admin":
        return True
    return usuario_participa_imovel(imovel_id, current_user.get("id"))


@app.route("/imoveis/<int:imovel_id>/socios", methods=["GET"])
@requires_auth
def get_socios_imovel(imovel_id):
    current_user = get_current_user() or {}
    if not _usuario_pode_ver_financeiro_compartilhado(imovel_id, current_user):
        return jsonify({"error": "Permissão insuficiente para este imóvel"}), 403
    incluir_inativos = request.args.get("incluir_inativos", "").lower() in {"1", "true", "sim", "yes"}
    try:
        dados = listar_socios_imovel(imovel_id, incluir_inativos=incluir_inativos)
        return jsonify({"data": dados}), 200
    except Exception as exc:
        print(f"Erro ao buscar sócios do imóvel {imovel_id}: {exc}")
        return jsonify({"error": "Erro ao buscar sócios do imóvel"}), 500


@app.route("/imoveis/<int:imovel_id>/socios", methods=["PUT"])
@requires_auth
@limiter.limit(RATE_LIMIT_EDIT)
def put_socios_imovel(imovel_id):
    current_user = get_current_user() or {}
    if current_user.get("role") != "admin":
        return jsonify({"error": "Apenas administradores podem alterar o quadro societário."}), 403

    payload = request.get_json(force=True, silent=True) or {}
    socios = payload.get("socios")
    if not isinstance(socios, list):
        return jsonify({"error": "Payload inválido. Use a chave 'socios' com uma lista."}), 400

    try:
        dados = salvar_socios_imovel(imovel_id, socios, current_user_id=current_user.get("id"))
        return jsonify(dados), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except LookupError as exc:
        return jsonify({"error": str(exc)}), 404
    except Exception as exc:
        print(f"Erro ao salvar sócios do imóvel {imovel_id}: {exc}")
        return jsonify({"error": "Erro ao salvar quadro societário"}), 500


@app.route("/imoveis/<int:imovel_id>/financeiro-compartilhado", methods=["GET"])
@requires_auth
def get_financeiro_compartilhado_imovel(imovel_id):
    current_user = get_current_user() or {}
    if not _usuario_pode_ver_financeiro_compartilhado(imovel_id, current_user):
        return jsonify({"error": "Permissão insuficiente para este imóvel"}), 403
    try:
        dados = obter_posicao_financeira_compartilhada(imovel_id)
        return jsonify(dados), 200
    except Exception as exc:
        print(f"Erro ao buscar financeiro compartilhado do imóvel {imovel_id}: {exc}")
        return jsonify({"error": "Erro ao buscar posição financeira compartilhada"}), 500


@app.route("/imoveis/<int:imovel_id>/equalizacoes", methods=["POST"])
@requires_auth
@limiter.limit(RATE_LIMIT_EDIT)
def post_equalizacao_imovel(imovel_id):
    current_user = get_current_user() or {}
    if not _usuario_pode_escrever_financeiro_compartilhado(imovel_id, current_user):
        return jsonify({"error": "Permissão insuficiente para registrar equalização neste imóvel"}), 403

    payload = request.get_json(force=True, silent=True) or {}
    paid_by_user_id = payload.get("paid_by_user_id")
    beneficiary_user_id = payload.get("beneficiary_user_id")
    valor = payload.get("valor")
    data = payload.get("data")
    descricao = (payload.get("descricao") or "").strip()

    if not paid_by_user_id or not beneficiary_user_id:
        return jsonify({"error": "Informe quem pagou e quem recebeu a equalização."}), 400
    if str(paid_by_user_id) == str(beneficiary_user_id):
        return jsonify({"error": "Pagador e recebedor da equalização devem ser diferentes."}), 400
    if valor in (None, "", 0, "0", "0.00", "0,00"):
        return jsonify({"error": "Informe um valor válido para a equalização."}), 400
    if not data:
        return jsonify({"error": "Informe a data da equalização."}), 400

    socios_ativos = listar_socios_imovel(imovel_id, incluir_inativos=False)
    socios_ids = {str(item.get("user_id")) for item in socios_ativos}
    if str(paid_by_user_id) not in socios_ids or str(beneficiary_user_id) not in socios_ids:
        return jsonify({"error": "Pagador e recebedor precisam ser sócios ativos do imóvel."}), 400

    descricao_final = descricao or "Equalização entre sócios"

    try:
        total = adicionar_lancamentos_em_lote([
            {
                "data": data,
                "id_imovel": imovel_id,
                "id_categoria": 0,
                "id_situacao": 1,
                "descricao": descricao_final,
                "valor": valor,
                "paid_by_user_id": paid_by_user_id,
                "beneficiary_user_id": beneficiary_user_id,
                "tipo_movimentacao": "equalizacao_socios",
                "created_by_user_id": current_user.get("id"),
            }
        ])
        return jsonify({
            "message": "Equalização registrada com sucesso.",
            "total": total,
        }), 201
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        print(f"Erro ao registrar equalização do imóvel {imovel_id}: {exc}")
        return jsonify({"error": "Erro ao registrar equalização"}), 500

# =====================================================
# 🔹 ROTAS CATEGORIAS
# =====================================================

@app.route("/categorias", methods=["GET"])
@requires_auth
def get_categorias():
    return jsonify(listar_categorias())

@app.route("/categorias", methods=["POST"])
@requires_editor_token
@limiter.limit(RATE_LIMIT_EDIT)
def add_categoria():
    data = request.json
    return jsonify(adicionar_categoria(data["categoria"], data["dc"]))

@app.route("/categorias/<int:categoria_id>", methods=["DELETE"])
@requires_editor_token
@limiter.limit(RATE_LIMIT_EDIT)
def delete_categoria(categoria_id):
    return jsonify(deletar_categoria(categoria_id))

# =====================================================
# 🔹 ROTAS LANÇAMENTOS
# =====================================================

@app.route("/lancamentos", methods=["GET"])
@requires_auth
def get_lancamentos():
    return jsonify(listar_lancamentos())

## Removido: endpoint genérico POST /lancamentos (inconsistente). Usar /gpt/lancamentos ou rotas do dashboard.

# =====================================================
# 🔹 ROTAS RESUMO FINANCEIRO
# =====================================================

@app.route("/dashboard/resumo-financeiro/<int:id_imovel>", methods=["GET"])
@requires_auth
def get_resumo_financeiro(id_imovel):
    current_user = get_current_user() or {}
    if not _usuario_pode_ver_financeiro_compartilhado(id_imovel, current_user):
        return jsonify({"error": "Permissão insuficiente para este imóvel"}), 403
    try:
        dados = listar_resumo_financeiro(id_imovel)
        imovel = buscar_imovel_por_id(id_imovel)
        return jsonify(
            {
                "items": dados,
                "ganho_capital": imovel.get("ganho_capital") if imovel else None,
            }
        )
    except Exception as e:
        print(f"Erro ao buscar resumo financeiro: {e}")
        return jsonify({"error": "Erro ao buscar resumo financeiro"}), 500

# 🔹 ROTA ALTERNATIVA (opcional)
@app.route("/dashboard/orcamento_execucao/<int:id_imovel>", methods=["GET"])
@requires_auth
def get_orcamento_execucao(id_imovel):
    current_user = get_current_user() or {}
    if not _usuario_pode_ver_financeiro_compartilhado(id_imovel, current_user):
        return jsonify({"error": "Permissão insuficiente para este imóvel"}), 403
    try:
        dados = listar_resumo_financeiro(id_imovel)
        return jsonify(dados)
    except Exception as e:
        print(f"Erro ao buscar orçamento execução: {e}")
        return jsonify({"error": "Erro ao buscar orçamento execução"}), 500


@app.route("/dashboard/resumo-imoveis", methods=["GET"])
@requires_auth
def get_resumo_imoveis():
    current_user = get_current_user() or {}
    incluir_vendidos_raw = request.args.get("includeVendidos") or request.args.get("incluir_vendidos")
    incluir_vendidos = True
    if incluir_vendidos_raw is not None:
        incluir_vendidos = incluir_vendidos_raw.lower() in {"1", "true", "t", "yes", "sim"}

    try:
        dados = listar_resumo_imoveis(
            incluir_vendidos,
            _ids_imoveis_financeiro_permitidos(current_user),
        )
        return jsonify(dados), 200
    except Exception as e:
        print(f"Erro ao buscar resumo de imóveis: {e}")
        return jsonify({"error": "Erro ao buscar resumo de imóveis"}), 500

# =====================================================
# 🔹 ROTAS ORÇAMENTOS
# =====================================================

@app.route("/orcamentos/<int:id_imovel>", methods=["GET"])
@requires_auth
def get_orcamentos_por_imovel(id_imovel):
    current_user = get_current_user() or {}
    if not _usuario_pode_ver_financeiro_compartilhado(id_imovel, current_user):
        return jsonify({"error": "Permissão insuficiente para este imóvel"}), 403
    orcamentos = listar_orcamentos_por_imovel(id_imovel)
    return jsonify(orcamentos), 200

@app.route("/orcamentos/<int:id_imovel>", methods=["POST"])
@requires_editor_token
@limiter.limit(RATE_LIMIT_EDIT)
def post_orcamentos_por_imovel(id_imovel):
    data = request.get_json()

    if not isinstance(data, list):
        return jsonify({"error": "Formato inválido! Esperado uma lista de orçamentos."}), 400

    resultado = atualizar_inserir_orcamentos(id_imovel, data)
    return jsonify(resultado), 200



import os


# Rota para servir o openapi.json
@app.route("/openapi.json", methods=["GET"])
def get_openapi_spec():
    caminho = os.path.join(os.path.dirname(__file__), "openapi.json")
    if os.path.exists(caminho):
        return send_file(caminho, mimetype="application/json")
    else:
        abort(404, description="Arquivo openapi.json não encontrado")

# =====================================================
# 🔹 BLUEPRINT DASHBOARD
# =====================================================

app.register_blueprint(dashboard_bp)

if DEBUG:
    print(app.url_map)

# =====================================================
# 🔹 INICIAR A API
# =====================================================

if __name__ == "__main__":
    app.run(debug=DEBUG)
