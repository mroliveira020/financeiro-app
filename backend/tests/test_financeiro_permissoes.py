import unittest
from datetime import date
from unittest.mock import MagicMock, patch

from models import (
    listar_imoveis_financeiro_acessiveis,
    listar_resumo_imoveis,
    listar_totais_mensais_por_imovel,
    listar_ultimos_lancamentos_confirmados,
    obter_data_ultima_atualizacao,
    usuario_participa_imovel,
)
from security import (
    get_finance_access_scope,
    user_has_finance_access,
    user_has_global_finance_access,
)


class FinanceiroPermissoesTestCase(unittest.TestCase):
    def setUp(self):
        self.conn = MagicMock()
        self.cur = MagicMock()
        for target in ('models.conectar', 'security.conectar'):
            mocked = patch(target, return_value=(self.conn, self.cur))
            mocked.start()
            self.addCleanup(mocked.stop)
        for target in (
            'models._garantir_tabela_imovel_socios',
            'models.backfill_imovel_socios_legacy',
        ):
            mocked = patch(target)
            mocked.start()
            self.addCleanup(mocked.stop)
        # Um teste que esquecer um mock falha antes de abrir o banco real.
        pool = patch('db_connection._init_pool', side_effect=AssertionError('Teste tentou acessar banco real'))
        pool.start()
        self.addCleanup(pool.stop)
        self.imoveis = [
            {'id': 23, 'nome': 'Araruna PR'},
            {'id': 24, 'nome': 'Rio Verde GO'},
            {'id': 99, 'nome': 'Imóvel sem vínculo'},
        ]
        listing = patch('models.listar_imoveis', return_value=self.imoveis)
        listing.start()
        self.addCleanup(listing.stop)

    def test_helpers_de_escopo_financeiro(self):
        self.assertTrue(user_has_global_finance_access('admin'))
        self.assertFalse(user_has_global_finance_access('prospector'))
        self.assertTrue(user_has_global_finance_access(None, ['admin']))
        self.assertTrue(user_has_finance_access(2, 'admin'))
        self.cur.execute.assert_not_called()

        self.cur.fetchone.return_value = (1,)
        self.assertTrue(user_has_finance_access(6, 'prospector'))
        self.assertTrue(user_has_finance_access(6, 'prospector', ['socio']))
        self.assertEqual(get_finance_access_scope(6, 'prospector'), 'restricted')
        self.assertEqual(get_finance_access_scope(6, 'prospector', ['socio']), 'restricted')
        self.assertEqual(get_finance_access_scope(2, 'admin'), 'global')
        sql, params = self.cur.execute.call_args.args
        self.assertEqual(params, (6,))
        self.assertIn('ativo = TRUE', sql)
        self.assertIn('percentual_participacao > 0', sql)

        self.cur.fetchone.return_value = None
        self.assertFalse(user_has_finance_access(4, 'prospector'))
        self.assertEqual(get_finance_access_scope(4, 'prospector'), 'none')

    def test_socio_ve_os_dois_imoveis_vinculados(self):
        self.cur.fetchall.return_value = [(23,), (24,)]
        imoveis = listar_imoveis_financeiro_acessiveis(viewer_user_id=6, viewer_role='prospector')
        self.assertEqual({item['id'] for item in imoveis}, {23, 24})
        sql, params = self.cur.execute.call_args.args
        self.assertEqual(params, (6,))
        self.assertIn('ativo = TRUE', sql)
        self.assertIn('percentual_participacao > 0', sql)

        for id_imovel in (23, 24, 99):
            self.cur.fetchone.return_value = (1,) if id_imovel in (23, 24) else None
            self.assertEqual(usuario_participa_imovel(id_imovel, 6), id_imovel in (23, 24))
            sql, params = self.cur.execute.call_args.args
            self.assertEqual(params, (id_imovel, 6))
            self.assertIn('ativo = TRUE', sql)
            self.assertIn('percentual_participacao > 0', sql)

    def test_sem_vinculos_nao_ve_imoveis(self):
        self.cur.fetchall.return_value = []
        self.assertEqual(listar_imoveis_financeiro_acessiveis(4, 'prospector'), [])
        self.assertEqual(listar_imoveis_financeiro_acessiveis(None, 'prospector'), [])

    def test_admin_ve_todos_os_imoveis(self):
        self.assertEqual(listar_imoveis_financeiro_acessiveis(2, 'admin'), self.imoveis)
        self.cur.execute.assert_not_called()

    def test_agregados_financeiros_restringem_consultas_aos_dois_imoveis(self):
        ids = [23, 24]
        self.cur.fetchone.return_value = (date(2026, 10, 15),)
        self.assertEqual(obter_data_ultima_atualizacao(ids), '15/10/2026')
        sql, params = self.cur.execute.call_args.args
        self.assertIn('id_imovel = ANY(%s)', sql)
        self.assertEqual(params, (ids,))

        self.cur.fetchall.return_value = [
            {'data': date(2026, 10, 15), 'imovel': 'Araruna PR', 'valor': 100},
            {'data': date(2026, 10, 14), 'imovel': 'Rio Verde GO', 'valor': 200},
        ]
        ultimos = listar_ultimos_lancamentos_confirmados(10, ids)
        self.assertEqual({item['imovel'] for item in ultimos}, {'Araruna PR', 'Rio Verde GO'})
        sql, params = self.cur.execute.call_args.args
        self.assertIn('l.id_imovel = ANY(%s)', sql)
        self.assertEqual(params, (ids, 10))

        self.cur.fetchall.return_value = [
            (date(2026, 10, 1), 23, 'Araruna PR', 100),
            (date(2026, 10, 1), 24, 'Rio Verde GO', 200),
        ]
        gastos = listar_totais_mensais_por_imovel(6, [8, 15, 18], True, ids)
        self.assertEqual({item['id_imovel'] for item in gastos}, {23, 24})
        sql, params = self.cur.execute.call_args.args
        self.assertIn('i.id = ANY(%s)', sql)
        self.assertEqual(params, (ids, (8, 15, 18), 5))

        self.cur.fetchone.return_value = {
            'total_efetivado': 300, 'total_a_investir': 0,
            'lucro_projetado': 0, 'investimento_total': 300,
            'imoveis_considerados': 2,
        }
        resumo = listar_resumo_imoveis(True, ids)
        self.assertEqual(resumo['totais']['imoveis_considerados'], 2)
        sql, params = self.cur.execute.call_args.args
        self.assertIn('i.id = ANY(%s)', sql)
        self.assertEqual(params, (ids,))

    def test_escopo_vazio_nao_consulta_agregados_globais(self):
        self.assertIsNone(obter_data_ultima_atualizacao([]))
        self.assertEqual(listar_ultimos_lancamentos_confirmados(10, []), [])
        self.assertEqual(listar_totais_mensais_por_imovel(id_imoveis_permitidos=[]), [])
        self.assertEqual(listar_resumo_imoveis(id_imoveis_permitidos=[])['imoveisConsiderados'], 0)
        self.cur.execute.assert_not_called()


if __name__ == '__main__':
    unittest.main()
