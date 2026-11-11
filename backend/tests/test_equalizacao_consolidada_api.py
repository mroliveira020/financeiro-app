import unittest
from unittest.mock import patch
from flask import g

from app import app
from models import SaldoEqualizacaoAlterado


class EqualizacaoConsolidadaApiTestCase(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        def usuario():
            g.current_user = {'id': 2, 'role': 'admin', 'capabilities': ['admin']}
            return g.current_user
        auth = patch('security._ensure_user_loaded', side_effect=usuario)
        auth.start()
        self.addCleanup(auth.stop)

    def test_get_usa_usuario_autenticado(self):
        with patch('dashboard.equalizacoes.obter_equalizacoes_consolidadas', return_value={'socios': [], 'avisos': []}) as obter:
            r = self.client.get('/imoveis/23/equalizacoes/consolidado?usuario_id=99')
        self.assertEqual(r.status_code, 200)
        obter.assert_called_once_with(23, 2)

    def test_get_sem_vinculo_retorna_403(self):
        with patch('dashboard.equalizacoes.obter_equalizacoes_consolidadas', side_effect=PermissionError('Sem vínculo')):
            r = self.client.get('/imoveis/23/equalizacoes/consolidado')
        self.assertEqual(r.status_code, 403)

    def test_post_saldo_alterado_retorna_409(self):
        with patch('dashboard.equalizacoes.registrar_equalizacao_consolidada', side_effect=SaldoEqualizacaoAlterado('Atualize os saldos.')):
            r = self.client.post('/imoveis/23/equalizacoes/consolidado', json={})
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json['error'], 'Atualize os saldos.')

    def test_post_ignora_identidade_enviada_e_retorna_recibo_idempotente(self):
        for repetida, status in [(False, 201), (True, 200)]:
            with patch('dashboard.equalizacoes.registrar_equalizacao_consolidada', return_value={'repetida': repetida}) as registrar:
                r = self.client.post('/imoveis/23/equalizacoes/consolidado', json={'usuario_id': 99})
            self.assertEqual(r.status_code, status)
            registrar.assert_called_once_with(23, 2, {'usuario_id': 99})

    def test_post_sem_vinculo_ou_payload_invalido(self):
        for exception, status in [(PermissionError('Sem vínculo'), 403), (ValueError('Dados inválidos'), 400)]:
            with patch('dashboard.equalizacoes.registrar_equalizacao_consolidada', side_effect=exception):
                r = self.client.post('/imoveis/23/equalizacoes/consolidado', json={})
            self.assertEqual(r.status_code, status)
