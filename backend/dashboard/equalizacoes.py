from flask import current_app, jsonify, request
from psycopg2.errors import DeadlockDetected, LockNotAvailable

from . import dashboard_bp
from config import RATE_LIMIT_EDIT
from models import (
    SaldoEqualizacaoAlterado,
    obter_equalizacoes_consolidadas,
    registrar_equalizacao_consolidada,
)
from ratelimit import limiter
from security import get_current_user, requires_auth


@dashboard_bp.route('/imoveis/<int:imovel_id>/equalizacoes/consolidado', methods=['GET'])
@requires_auth
def consultar_equalizacoes_consolidadas(imovel_id):
    usuario = get_current_user() or {}
    try:
        return jsonify(obter_equalizacoes_consolidadas(imovel_id, usuario.get('id'))), 200
    except PermissionError as exc:
        return jsonify({'error': str(exc)}), 403
    except Exception:
        current_app.logger.exception('Erro ao consultar acertos do imóvel %s', imovel_id)
        return jsonify({'error': 'Não foi possível consultar os saldos de equalização.'}), 500


@dashboard_bp.route('/imoveis/<int:imovel_id>/equalizacoes/consolidado', methods=['POST'])
@requires_auth
@limiter.limit(RATE_LIMIT_EDIT)
def confirmar_equalizacao_consolidada(imovel_id):
    usuario = get_current_user() or {}
    try:
        dados = registrar_equalizacao_consolidada(
            imovel_id, usuario.get('id'), request.get_json(silent=True),
        )
        return jsonify(dados), 200 if dados['repetida'] else 201
    except PermissionError as exc:
        return jsonify({'error': str(exc)}), 403
    except (SaldoEqualizacaoAlterado, LockNotAvailable, DeadlockDetected) as exc:
        mensagem = str(exc) if isinstance(exc, SaldoEqualizacaoAlterado) else 'Há outra alteração em andamento. Atualize os saldos e tente novamente.'
        return jsonify({'error': mensagem}), 409
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    except Exception:
        current_app.logger.exception('Erro ao registrar acerto do imóvel %s', imovel_id)
        return jsonify({'error': 'Não foi possível registrar o acerto consolidado. Tente novamente com os mesmos dados.'}), 500
