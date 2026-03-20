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
    listar_prospeccoes_meta,
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
from flask import g
from werkzeug.exceptions import HTTPException


app = Flask(__name__)
# Proxy IP fix para uso por trás de proxy (Render)
if TRUST_PROXY:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1)
# Configura CORS conforme origens permitidas
cors_resources = {r"/*": {"origins": ALLOWED_ORIGINS_LIST or "*"}}
CORS(app, resources=cors_resources)

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

@app.route("/imoveis", methods=["POST"])
@requires_editor_token
@limiter.limit(RATE_LIMIT_EDIT)
def add_imovel():
    data = request.json
    return jsonify(adicionar_imovel(data["nome"], data["vendido"]))

@app.route("/imoveis/<int:imovel_id>", methods=["GET"])
@requires_auth
def get_imovel_by_id(imovel_id):
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
        modalidades = request.args.getlist("modalidade")
        status_list = request.args.getlist("status")
        financia_list = request.args.getlist("financia")
        cidades = request.args.getlist("cidade")
        order_by = request.args.get("order_by", "coletado_em")
        order_dir = request.args.get("order_dir", "desc")
    except ValueError:
        return jsonify({"error": "Parâmetros inválidos"}), 400

    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    offset = (page - 1) * page_size

    result = listar_prospeccoes_capturados(
        limit=page_size,
        offset=offset,
        ufs=ufs or None,
        modalidades=modalidades or None,
        status=status_list or ["disponivel"],
        financia=financia_list or None,
        cidades=cidades or None,
        order_by=order_by,
        order_dir=order_dir,
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
    status = request.args.get("status")
    uf = request.args.get("uf")
    dados = listar_prospeccoes_selecionados(status=status, uf=uf)
    return jsonify({"data": dados})


@app.route("/prospeccoes/selecionados", methods=["POST"])
@requires_prospeccao_write
@limiter.limit(RATE_LIMIT_EDIT)
def post_prospeccoes_selecionados():
    payload = request.get_json(force=True, silent=True) or {}
    current_user = get_current_user() or {}
    numero_bem = payload.get("numero_bem")
    if not numero_bem:
        return jsonify({"error": "numero_bem é obrigatório"}), 400
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


@app.route("/prospeccoes/selecionados/<numero_bem>", methods=["DELETE"])
@requires_prospeccao_write
@limiter.limit(RATE_LIMIT_EDIT)
def delete_prospeccoes_selecionados(numero_bem):
    if not numero_bem:
        return jsonify({"error": "numero_bem é obrigatório"}), 400
    result = excluir_prospeccao_selecionado(numero_bem)
    if not result.get("deleted"):
        return jsonify(result), 404
    return jsonify(result), 200


@app.route("/prospeccoes/meta", methods=["GET"])
@requires_auth
def get_prospeccoes_meta():
    return jsonify(listar_prospeccoes_meta())

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
    try:
        dados = listar_resumo_financeiro(id_imovel)
        return jsonify(dados)
    except Exception as e:
        print(f"Erro ao buscar resumo financeiro: {e}")
        return jsonify({"error": "Erro ao buscar resumo financeiro"}), 500

# 🔹 ROTA ALTERNATIVA (opcional)
@app.route("/dashboard/orcamento_execucao/<int:id_imovel>", methods=["GET"])
@requires_auth
def get_orcamento_execucao(id_imovel):
    try:
        dados = listar_resumo_financeiro(id_imovel)
        return jsonify(dados)
    except Exception as e:
        print(f"Erro ao buscar orçamento execução: {e}")
        return jsonify({"error": "Erro ao buscar orçamento execução"}), 500


@app.route("/dashboard/resumo-imoveis", methods=["GET"])
@requires_auth
def get_resumo_imoveis():
    incluir_vendidos_raw = request.args.get("includeVendidos") or request.args.get("incluir_vendidos")
    incluir_vendidos = True
    if incluir_vendidos_raw is not None:
        incluir_vendidos = incluir_vendidos_raw.lower() in {"1", "true", "t", "yes", "sim"}

    try:
        dados = listar_resumo_imoveis(incluir_vendidos)
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
