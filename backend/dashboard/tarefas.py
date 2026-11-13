import uuid

from flask import current_app, jsonify, request

from . import dashboard_bp
from config import RATE_LIMIT_EDIT
from models import (
    TarefaConflito, listar_tarefas_portal, opcoes_tarefas_portal,
    salvar_tarefa_portal, resumo_tarefas_portal, intencao_participacao_portal,
)
from ratelimit import limiter
from security import get_current_user, requires_auth


def _responder(operacao):
    try:
        return jsonify(operacao()), 200
    except PermissionError as exc:
        return jsonify(error=str(exc)), 403
    except TarefaConflito as exc:
        return jsonify(error=str(exc)), 409
    except (ValueError, TypeError) as exc:
        return jsonify(error=str(exc)), 400
    except Exception:
        current_app.logger.exception('Falha na operação de tarefas')
        return jsonify(error='Não foi possível concluir a operação. Tente novamente.'), 500


def _inteiro_positivo(valor):
    try:
        numero = int(valor)
        if numero < 1 or numero > 1000000000:
            raise ValueError()
        return numero
    except (ValueError, TypeError):
        raise ValueError('Informe um identificador ou página válidos.')


def _filtros():
    filtros = request.args.to_dict()
    for campo in ('imovel_id', 'responsavel_id', 'pagina'):
        if filtros.get(campo):
            filtros[campo] = _inteiro_positivo(filtros[campo])
    if filtros.get('situacao') not in (None, '', 'a_fazer', 'concluida'):
        raise ValueError('Situação inválida.')
    if filtros.get('arquivadas') not in (None, '', 'sim', 'nao', 'todas'):
        raise ValueError('Filtro de arquivamento inválido.')
    return filtros


@dashboard_bp.route('/tarefas', methods=['GET'])
@requires_auth
def consultar_tarefas():
    return _responder(lambda: listar_tarefas_portal(get_current_user(), _filtros()))


@dashboard_bp.route('/tarefas/opcoes', methods=['GET'])
@requires_auth
def consultar_opcoes_tarefas():
    return _responder(lambda: opcoes_tarefas_portal(
        get_current_user(), request.args.get('busca', ''), request.args.get('numero_bem'),
        _inteiro_positivo(request.args['imovel_id']) if request.args.get('imovel_id') else None,
    ))


@dashboard_bp.route('/tarefas/resumo', methods=['GET'])
@requires_auth
def consultar_resumo_tarefas():
    numeros = request.args.getlist('numero_bem')
    if len(numeros) > 100 or any(len(n) > 120 for n in numeros):
        return jsonify(error='Informe até 100 imóveis.'), 400
    return _responder(lambda: resumo_tarefas_portal(get_current_user(), numeros))


@dashboard_bp.route('/tarefas', methods=['POST'])
@requires_auth
@limiter.limit(RATE_LIMIT_EDIT)
def criar_tarefa():
    dados = request.get_json(silent=True)
    if not isinstance(dados, dict) or dados.get('versao'):
        return jsonify(error='Informe os dados de uma nova tarefa.'), 400
    return _responder(lambda: salvar_tarefa_portal(get_current_user(), dados))


@dashboard_bp.route('/tarefas/<uuid:tarefa_id>', methods=['PUT'])
@requires_auth
@limiter.limit(RATE_LIMIT_EDIT)
def atualizar_tarefa(tarefa_id):
    dados = request.get_json(silent=True)
    if not isinstance(dados, dict) or type(dados.get('versao')) is not int or dados['versao'] <= 0:
        return jsonify(error='Informe a versão da tarefa.'), 400
    return _responder(lambda: salvar_tarefa_portal(get_current_user(), dados, str(tarefa_id)))


@dashboard_bp.route('/tarefas/intencao/<numero_bem>', methods=['GET', 'POST', 'DELETE'])
@requires_auth
@limiter.limit(RATE_LIMIT_EDIT)
def intencao_tarefas(numero_bem):
    def operar():
        if not 1 <= len(numero_bem) <= 120:
            raise ValueError('Código do imóvel inválido.')
        acao = {'GET': 'consultar', 'POST': 'registrar', 'DELETE': 'retirar'}[request.method]
        intencao_id = None
        if acao == 'retirar':
            dados = request.get_json(silent=True) or {}
            try:
                intencao_id = str(uuid.UUID(str(dados.get('id'))))
            except (ValueError, TypeError):
                raise ValueError('Identificador da intenção inválido.')
        return dict(intencao=intencao_participacao_portal(get_current_user(), numero_bem, acao, intencao_id))
    return _responder(operar)
