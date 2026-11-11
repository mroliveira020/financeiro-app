import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from psycopg2.errors import UniqueViolation

from models import adicionar_lancamento, adicionar_lancamentos_em_lote


class ConflitoUniqueFake(UniqueViolation):
    def __init__(self, constraint='lançamentos_pkey', table='lancamentos'):
        super().__init__('Conflito simulado')
        self._diag = SimpleNamespace(constraint_name=constraint, table_name=table)

    @property
    def diag(self):
        return self._diag


class LancamentosLoteTestCase(unittest.TestCase):
    def setUp(self):
        self.conn = MagicMock()
        self.cur = MagicMock()
        self.cur.fetchall.return_value = [{'user_id': 6}, {'user_id': 7}]
        for target, kwargs in (
            ('models.conectar', {'return_value': (self.conn, self.cur)}),
            ('models._garantir_colunas_lancamentos_compartilhado', {}),
            ('db_connection._init_pool', {
                'side_effect': AssertionError('Teste tentou acessar banco real'),
            }),
        ):
            mocked = patch(target, **kwargs)
            mocked.start()
            self.addCleanup(mocked.stop)
        self.lancamento = {
            'data': '09/11/2026',
            'id_imovel': 24,
            'id_categoria': 9,
            'id_situacao': 1,
            'descricao': 'ITBI',
            'valor': 2253.70,
            'paid_by_user_id': 6,
        }

    def test_inclui_despesa_com_pagador_e_devolve_conexao(self):
        self.assertEqual(adicionar_lancamentos_em_lote([self.lancamento]), 1)
        query, params = self.cur.execute.call_args.args
        self.assertIn('INSERT INTO lancamentos', query)
        self.assertEqual(params[:8], (
            '2026-11-09', 24, 9, 1, 'ITBI', 2253.70, True, 6,
        ))
        self.conn.commit.assert_called_once()
        self.conn.rollback.assert_not_called()
        self.conn.close.assert_called_once()

    def test_erro_de_insercao_faz_rollback_e_libera_conexao(self):
        failure = RuntimeError('Conflito de chave no banco')

        def execute(query, params):
            if 'INSERT INTO lancamentos' in query:
                raise failure

        self.cur.execute.side_effect = execute
        with self.assertRaises(RuntimeError) as result:
            adicionar_lancamentos_em_lote([self.lancamento])
        self.assertIs(result.exception, failure)
        self.conn.commit.assert_not_called()
        self.conn.rollback.assert_called_once()
        self.conn.close.assert_called_once()

    def test_pagador_invalido_no_segundo_item_reverte_todo_o_lote(self):
        segundo = {**self.lancamento, 'paid_by_user_id': 99}
        with self.assertRaisesRegex(ValueError, 'sócio ativo'):
            adicionar_lancamentos_em_lote([self.lancamento, segundo])
        inserts = [
            call for call in self.cur.execute.call_args_list
            if 'INSERT INTO lancamentos' in call.args[0]
        ]
        self.assertEqual(len(inserts), 1)
        self.conn.commit.assert_not_called()
        self.conn.rollback.assert_called_once()
        self.conn.close.assert_called_once()

    def test_falha_no_commit_tambem_libera_conexao(self):
        self.conn.commit.side_effect = RuntimeError('Falha no commit')
        with self.assertRaisesRegex(RuntimeError, 'Falha no commit'):
            adicionar_lancamentos_em_lote([self.lancamento])
        self.conn.rollback.assert_called_once()
        self.conn.close.assert_called_once()

    def test_data_malformada_retorna_erro_em_portugues_e_libera_conexao(self):
        with self.assertRaisesRegex(ValueError, 'Data inválida. Use DD/MM/AAAA'):
            adicionar_lancamentos_em_lote([{**self.lancamento, 'data': '09/11'}])
        self.cur.execute.assert_not_called()
        self.conn.commit.assert_not_called()
        self.conn.rollback.assert_called_once()
        self.conn.close.assert_called_once()

    def test_colisao_no_segundo_item_refaz_lote_inteiro_sem_duplicar(self):
        staged = []
        committed = []
        tentativas = []

        def execute(query, params=None):
            if 'INSERT INTO lancamentos' not in query:
                return
            tentativas.append(params[4])
            if len(tentativas) == 2:
                raise ConflitoUniqueFake()
            staged.append(params[4])

        self.cur.execute.side_effect = execute
        self.conn.rollback.side_effect = staged.clear
        self.conn.commit.side_effect = lambda: committed.extend(staged)
        segundo = {**self.lancamento, 'descricao': 'Registro'}
        self.assertEqual(adicionar_lancamentos_em_lote([self.lancamento, segundo]), 2)
        self.assertEqual(tentativas, ['ITBI', 'Registro', 'ITBI', 'Registro'])
        self.assertEqual(committed, ['ITBI', 'Registro'])
        self.conn.rollback.assert_called_once()
        self.conn.commit.assert_called_once()
        self.conn.close.assert_called_once()
        queries = [call.args[0] for call in self.cur.execute.call_args_list]
        self.assertEqual(sum('LOCK TABLE' in query for query in queries), 1)
        self.assertTrue(any('ultimo_id <= maior_id' in query for query in queries))

    def test_inclusao_individual_tambem_recupera_colisao_de_id(self):
        tentativas = []

        def execute(query, params=None):
            if 'INSERT INTO lancamentos' in query:
                tentativas.append(params)
                if len(tentativas) == 1:
                    raise ConflitoUniqueFake('lançamentos_id_key')

        self.cur.execute.side_effect = execute
        self.cur.fetchone.return_value = (1287,)
        resultado = adicionar_lancamento(**self.lancamento, ativo=True)
        self.assertEqual(resultado['id'], 1287)
        self.assertEqual(len(tentativas), 2)
        self.conn.rollback.assert_called_once()
        self.conn.commit.assert_called_once()
        self.conn.close.assert_called_once()

    def test_conflito_persistente_nao_entra_em_loop(self):
        tentativas = []

        def execute(query, params=None):
            if 'INSERT INTO lancamentos' in query:
                tentativas.append(params)
                raise ConflitoUniqueFake()

        self.cur.execute.side_effect = execute
        with self.assertRaises(UniqueViolation):
            adicionar_lancamentos_em_lote([self.lancamento])
        self.assertEqual(len(tentativas), 2)
        self.assertEqual(self.conn.rollback.call_count, 2)
        self.conn.commit.assert_not_called()
        self.conn.close.assert_called_once()

    def test_outros_conflitos_nao_alteram_sequencia_nem_repetem_gravacao(self):
        for constraint, table in (
            ('outra_chave_unique', 'lancamentos'),
            ('lançamentos_pkey', 'outra_tabela'),
        ):
            with self.subTest(constraint=constraint, table=table):
                self.cur.reset_mock()
                self.conn.reset_mock()
                self.cur.execute.side_effect = ConflitoUniqueFake(constraint, table)
                with self.assertRaises(UniqueViolation):
                    adicionar_lancamentos_em_lote([self.lancamento])
                self.assertEqual(self.cur.execute.call_count, 1)
                self.conn.rollback.assert_called_once()
                self.conn.commit.assert_not_called()
                self.conn.close.assert_called_once()

    def test_timeout_na_sincronizacao_aborta_sem_nova_insercao(self):
        tentativas = []

        def execute(query, params=None):
            if 'INSERT INTO lancamentos' in query:
                tentativas.append(params)
                raise ConflitoUniqueFake()
            if 'LOCK TABLE' in query:
                raise RuntimeError('Tempo limite do bloqueio')

        self.cur.execute.side_effect = execute
        with self.assertRaisesRegex(RuntimeError, 'Tempo limite do bloqueio'):
            adicionar_lancamentos_em_lote([self.lancamento])
        self.assertEqual(len(tentativas), 1)
        self.assertEqual(self.conn.rollback.call_count, 2)
        self.conn.commit.assert_not_called()
        self.conn.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
