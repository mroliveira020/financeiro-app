import unittest
from datetime import date
from unittest.mock import MagicMock, patch
from flask import g

from app import app
from models import (
    _normalizar_tarefa, _escopo_tarefas, _registro_tarefas_json,
    salvar_tarefa_portal, intencao_participacao_portal, TarefaConflito,
)

TASK_ID = '11111111-1111-4111-8111-111111111111'
INTENT_ID = '22222222-2222-4222-8222-222222222222'
USER = {'id': 2, 'role': 'prospector'}
DATA = dict(id=TASK_ID, titulo='Obter matrícula', descricao='Solicitar certidão atualizada',
            numero_bem='DEMO', imovel_id=None, responsavel_id=None, prazo='2026-12-01',
            situacao='a_fazer', origem='manual')


class TarefasModeloTest(unittest.TestCase):
    def test_normaliza_dados_e_rejeita_situacoes_inexistentes(self):
        self.assertEqual(_normalizar_tarefa(DATA)['prazo'], date(2026, 12, 1))
        for changes in ({'titulo': ''}, {'situacao': 'em_andamento'}, {'origem': 'ia'}, {'prazo': 'invalido'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                _normalizar_tarefa(dict(DATA, **changes))

    def test_escopo_restringe_financeiro_aos_socios_e_prospeccao_aos_prospectores(self):
        sql, params = _escopo_tarefas(USER)
        self.assertIn('s.user_id = %s', sql)
        self.assertEqual(params, [True, 2])
        self.assertEqual(_escopo_tarefas({'id': 3, 'role': 'socio'})[1], [False, 3])
        self.assertEqual(_escopo_tarefas({'id': 1, 'role': 'admin'}), ('TRUE', []))

    def test_datas_usam_iso_para_campos_da_interface(self):
        self.assertEqual(_registro_tarefas_json({'prazo': date(2026, 12, 1)})['prazo'], '2026-12-01')

    @patch('models.conectar')
    def test_criacao_usa_id_estavel_commit_e_encerramento(self, conectar):
        conn, cur = MagicMock(), MagicMock()
        conectar.return_value = conn, cur
        cur.fetchone.side_effect = [None, {'existe': 1}, dict(DATA, prazo=date(2026, 12, 1), versao=1)]
        result = salvar_tarefa_portal(USER, DATA)
        self.assertEqual(result['id'], TASK_ID)
        self.assertEqual(result['prazo'], '2026-12-01')
        self.assertIn('ON CONFLICT (id) DO NOTHING', cur.execute.call_args.args[0])
        conn.commit.assert_called_once()
        conn.close.assert_called_once()

    @patch('models.conectar')
    def test_reenvio_identico_recupera_tarefa_sem_duplicar(self, conectar):
        conn, cur = MagicMock(), MagicMock()
        conectar.return_value = conn, cur
        cur.fetchone.return_value = dict(_normalizar_tarefa(DATA), id=TASK_ID, created_by=2, versao=1)
        result = salvar_tarefa_portal(USER, DATA)
        self.assertEqual(result['versao'], 1)
        self.assertEqual(cur.execute.call_count, 1)
        conn.commit.assert_not_called()

    @patch('models.conectar')
    def test_versao_antiga_impede_sobrescrever_edicao_concorrente(self, conectar):
        conn, cur = MagicMock(), MagicMock()
        conectar.return_value = conn, cur
        cur.fetchone.return_value = dict(DATA, created_by=2, versao=3)
        with self.assertRaises(TarefaConflito):
            salvar_tarefa_portal(USER, dict(DATA, versao=2), TASK_ID)
        conn.rollback.assert_called_once()
        conn.commit.assert_not_called()

    @patch('models.conectar')
    def test_sem_acesso_nao_atualiza_tarefa(self, conectar):
        conn, cur = MagicMock(), MagicMock()
        conectar.return_value = conn, cur
        cur.fetchone.return_value = None
        with self.assertRaises(PermissionError):
            salvar_tarefa_portal(USER, dict(DATA, versao=1), TASK_ID)
        self.assertEqual(cur.execute.call_count, 1)
        conn.rollback.assert_called_once()

    @patch('models.conectar')
    def test_retirada_arquiva_apenas_preparacao_a_fazer_da_intencao_correta(self, conectar):
        conn, cur = MagicMock(), MagicMock()
        conectar.return_value = conn, cur
        cur.fetchone.side_effect = [{'existe': 1}, {'id': INTENT_ID}, None]
        intencao_participacao_portal(USER, 'DEMO', 'retirar', INTENT_ID)
        statements = [call.args[0] for call in cur.execute.call_args_list]
        archive = next(sql for sql in statements if sql.startswith('UPDATE portal_tarefas'))
        self.assertIn("situacao='a_fazer'", archive)
        self.assertIn('intencao_id=%s', archive)
        self.assertNotIn('DELETE', ' '.join(statements))
        conn.commit.assert_called_once()

    @patch('models.conectar')
    def test_intencao_retirada_impede_tarefa_tardia(self, conectar):
        conn, cur = MagicMock(), MagicMock()
        conectar.return_value = conn, cur
        cur.fetchone.return_value = {'id': INTENT_ID, 'retirada_em': '2026-11-13'}
        with self.assertRaises(TarefaConflito):
            salvar_tarefa_portal(USER, dict(DATA, origem='preparacao', intencao_id=INTENT_ID))
        self.assertIn('portal_intencoes_participacao', cur.execute.call_args_list[0].args[0])
        conn.commit.assert_not_called()


class TarefasApiTest(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        def usuario():
            g.current_user = USER
            return USER
        auth = patch('security._ensure_user_loaded', side_effect=usuario)
        auth.start()
        self.addCleanup(auth.stop)

    def test_prospector_consulta_tarefas_com_identidade_da_sessao(self):
        with patch('dashboard.tarefas.listar_tarefas_portal', return_value={'data': []}) as listar:
            response = self.client.get('/tarefas?usuario_id=999')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(listar.call_args.args[0]['id'], 2)

    def test_filtro_invalido_nao_acessa_banco(self):
        with patch('dashboard.tarefas.listar_tarefas_portal') as listar:
            self.assertEqual(self.client.get('/tarefas?situacao=em_andamento').status_code, 400)
            listar.assert_not_called()

    def test_post_e_put_operacionais_com_read_only(self):
        with patch('dashboard.tarefas.salvar_tarefa_portal', return_value={'id': TASK_ID}) as salvar:
            self.assertEqual(self.client.post('/tarefas', json=DATA).status_code, 200)
            self.assertEqual(self.client.put('/tarefas/' + TASK_ID, json=dict(DATA, versao=1)).status_code, 200)
            self.assertEqual(salvar.call_args.args[0], USER)

    def test_erros_de_permissao_e_concorrencia(self):
        for exception, status in [(PermissionError('Sem acesso'), 403), (TarefaConflito('Atualize a tarefa'), 409)]:
            with patch('dashboard.tarefas.salvar_tarefa_portal', side_effect=exception):
                self.assertEqual(self.client.post('/tarefas', json=DATA).status_code, status)

    def test_resumos_limitados_a_cem_imoveis(self):
        self.assertEqual(self.client.get('/tarefas/resumo?' + '&'.join(['numero_bem=X'] * 101)).status_code, 400)

    def test_retirada_exige_identificador_da_intencao(self):
        with patch('dashboard.tarefas.intencao_participacao_portal') as alterar:
            self.assertEqual(self.client.delete('/tarefas/intencao/DEMO', json={}).status_code, 400)
            alterar.assert_not_called()

class TarefasRestauracaoTest(unittest.TestCase):
    @patch('models.conectar')
    def test_preparacao_arquivada_manualmente_pode_ser_restaurada_com_intencao_ativa(self, conectar):
        conn, cur = MagicMock(), MagicMock()
        conectar.return_value = conn, cur
        dados = dict(DATA, origem='preparacao', intencao_id=INTENT_ID, versao=2, arquivada=False)
        anterior = dict(_normalizar_tarefa(dados), id=TASK_ID, intencao_id=INTENT_ID, versao=2,
                        arquivada_em='2026-11-13', created_by=2)
        cur.fetchone.side_effect = [
            {'id': INTENT_ID, 'retirada_em': None}, anterior, {'existe': 1},
            dict(anterior, versao=3, arquivada_em=None),
        ]
        result = salvar_tarefa_portal(USER, dados, TASK_ID)
        self.assertIsNone(result['arquivada_em'])
        self.assertEqual(result['versao'], 3)
        conn.commit.assert_called_once()

    @patch('models._validar_responsavel_tarefa')
    @patch('models.conectar')
    def test_conclusao_preserva_responsavel_anterior_mesmo_apos_inativacao(self, conectar, validar):
        conn, cur = MagicMock(), MagicMock()
        conectar.return_value = conn, cur
        dados = dict(DATA, responsavel_id=3, situacao='concluida', versao=1)
        anterior = dict(_normalizar_tarefa(dict(DATA, responsavel_id=3)), id=TASK_ID, versao=1)
        cur.fetchone.side_effect = [anterior, {'existe': 1}, dict(dados, versao=2)]
        salvar_tarefa_portal(USER, dados, TASK_ID)
        validar.assert_not_called()
        conn.commit.assert_called_once()
