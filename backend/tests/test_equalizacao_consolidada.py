import unittest
from unittest.mock import MagicMock, patch

from models import (
    SaldoEqualizacaoAlterado, _calcular_posicao_financeira_compartilhada,
    _centavos_equalizacao, _contexto_equalizacao_consolidada,
    _preparar_pedido_equalizacao, _resumir_equalizacoes_consolidadas,
    registrar_equalizacao_consolidada, _validar_equalizacao_individual,
)


class EqualizacaoConsolidadaTestCase(unittest.TestCase):
    def setUp(self):
        self.conn, self.cur = MagicMock(), MagicMock()
        self.conexao = patch('models.conectar', return_value=(self.conn, self.cur))
        self.conexao.start()
        self.addCleanup(self.conexao.stop)
        self.pedido = {
            'operacao_id': '48a6cfcc-5e6b-40e4-a5e3-3939dfe162dc',
            'socio_id': 6, 'data': '2026-11-11', 'descricao': 'Acerto entre imóveis',
            'imoveis': [{'id_imovel': 23, 'versao': 'a' * 64}, {'id_imovel': 24, 'versao': 'b' * 64}],
        }
        self.contexto = {'socios': [{'socio_id': 6, 'imoveis': [
            {'id_imovel': 23, 'saldo_centavos': 10000, 'versao': 'a' * 64},
            {'id_imovel': 24, 'saldo_centavos': -6000, 'versao': 'b' * 64},
        ]}], 'avisos': []}
        self.operacao = {
            'id': self.pedido['operacao_id'], 'usuario_id': 2, 'valor_transferido': 40,
            'paid_by_user_id': 6, 'beneficiary_user_id': 2,
            'itens': [{'id_imovel': 23, 'saldo_centavos': 10000}, {'id_imovel': 24, 'saldo_centavos': -6000}],
        }

    def socios(self, imovel_id):
        return [dict(user_id=uid, percentual_participacao=50, user_name=nome, user_email='',
                     id_imovel=imovel_id, imovel_nome=imovel)
                for uid, nome, imovel in [(2, 'Ana', 'Imóvel ' + str(imovel_id)), (6, 'Marco', 'Imóvel ' + str(imovel_id))]]

    def despesa(self, uid, valor, identificador=1):
        return dict(id=identificador, data='2026-11-10', descricao='Despesa', valor=valor,
                    paid_by_user_id=uid, beneficiary_user_id=None, tipo_movimentacao='despesa_imovel')

    def test_resumo_mostra_credito_e_debito_com_mesmo_socio(self):
        result = _resumir_equalizacoes_consolidadas(
            {23: self.socios(23), 24: self.socios(24)},
            {23: [self.despesa(2, 200)], 24: [self.despesa(6, 120)]}, 2, 23)
        grupo = result['socios'][0]
        self.assertEqual(grupo['socio_id'], 6)
        self.assertEqual(grupo['saldo_centavos'], 4000)
        self.assertEqual([i['saldo_centavos'] for i in grupo['imoveis']], [10000, -6000])
        self.assertTrue(grupo['imoveis'][0]['atual'])
        self.assertFalse(grupo['imoveis'][1]['atual'])

    def test_porcentagem_incompleta_mais_socios_e_despesas_sem_pagador_sao_excluidos(self):
        for caso in ('percentual', 'terceiro', 'sem_pagador'):
            with self.subTest(caso=caso):
                socios = self.socios(23)
                despesas = [self.despesa(2, 200)]
                if caso == 'percentual': socios[0]['percentual_participacao'] = 40
                if caso == 'terceiro': socios.append(dict(socios[0], user_id=7))
                if caso == 'sem_pagador': despesas = [self.despesa(None, 200)]
                result = _resumir_equalizacoes_consolidadas({23: socios}, {23: despesas}, 2, 23)
                self.assertEqual(result['socios'], [])
                self.assertEqual(len(result['avisos']), 1)

    def test_versao_muda_quando_lancamento_muda_mesmo_com_saldo_igual(self):
        args = ({23: self.socios(23)}, {23: [self.despesa(2, 200)]}, 2, 23)
        anterior = _resumir_equalizacoes_consolidadas(*args)['socios'][0]['imoveis'][0]['versao']
        args[1][23][0]['descricao'] = 'Despesa revisada'
        atual = _resumir_equalizacoes_consolidadas(*args)['socios'][0]['imoveis'][0]['versao']
        self.assertNotEqual(anterior, atual)

    def test_pagamento_ou_compensacao_zera_cada_imovel(self):
        for valor, pagador, recebedor in [(200, 6, 2), (120, 2, 6)]:
            despesas = [self.despesa(2 if pagador == 6 else 6, valor), dict(
                id=2, data='2026-11-11', descricao='Rateio', valor=valor/2,
                tipo_movimentacao='equalizacao_socios', paid_by_user_id=pagador, beneficiary_user_id=recebedor,
            )]
            result = _calcular_posicao_financeira_compartilhada(23, self.socios(23), despesas)
            self.assertEqual([s['saldo_liquido'] for s in result['socios']], [0, 0])
            self.assertEqual(result['totais']['total_despesas_operacionais'], valor)

    def test_rateio_de_centavo_impar_fecha_saldos_sem_criar_divida(self):
        socios = self.socios(23)
        r = _calcular_posicao_financeira_compartilhada(23, socios, [self.despesa(2, 100.01)])
        devidos = {s['user_id']: s['valor_devido_participacao'] for s in r['socios']}
        self.assertEqual(devidos, {2: 50.01, 6: 50})
        self.assertEqual(sum(s['saldo_liquido'] for s in r['socios']), 0)
        invertido = _calcular_posicao_financeira_compartilhada(23, list(reversed(socios)), [self.despesa(2, 100.01)])
        self.assertEqual({s['user_id']: s['valor_devido_participacao'] for s in invertido['socios']}, devidos)
        contexto = _resumir_equalizacoes_consolidadas({23: socios}, {23: [self.despesa(2, 100.01)]}, 2, 23)
        self.assertEqual(contexto['avisos'], [])

    def test_dinheiro_rejeita_nan_infinito_e_fracao_de_centavo(self):
        for valor in ('NaN', 'Infinity', '1.001', True):
            with self.subTest(valor=valor), self.assertRaises(ValueError): _centavos_equalizacao(valor)
        self.assertEqual(_centavos_equalizacao('123.45'), 12345)

    def test_rejeita_imoveis_repetidos_e_lista_unitaria(self):
        for itens in ([self.pedido['imoveis'][0]], [self.pedido['imoveis'][0]] * 2):
            with self.assertRaises(ValueError):
                _preparar_pedido_equalizacao(dict(self.pedido, imoveis=itens), 2, 23)

    def test_usuario_sem_vinculo_nao_consulta_outros_imoveis(self):
        self.cur.fetchone.return_value = None
        with self.assertRaises(PermissionError): _contexto_equalizacao_consolidada(self.cur, 23, 99)
        self.assertEqual(self.cur.execute.call_count, 1)

    def test_grava_uma_operacao_e_duas_parcelas_em_um_commit(self):
        self.cur.fetchone.side_effect = [None, self.operacao]
        with patch('models._contexto_equalizacao_consolidada', return_value=self.contexto):
            result = registrar_equalizacao_consolidada(23, 2, self.pedido)
        self.assertEqual(result['valor_transferido'], 40)
        inserts = [c.args for c in self.cur.execute.call_args_list if c.args[0].startswith('INSERT INTO lancamentos')]
        self.assertEqual(len(inserts), 2)
        self.assertEqual(inserts[0][1][3:6], (100, 6, 2))
        self.assertEqual(inserts[1][1][3:6], (60, 2, 6))
        self.conn.commit.assert_called_once()
        self.conn.rollback.assert_not_called()

    def test_saldo_alterado_ou_imovel_inacessivel_reverte_sem_gravar(self):
        for caso in ('alterado', 'inacessivel'):
            contexto = {'socios': [{'socio_id': 6, 'imoveis': [dict(i) for i in self.contexto['socios'][0]['imoveis']]}]}
            if caso == 'alterado': contexto['socios'][0]['imoveis'][1]['versao'] = 'c' * 64
            else: contexto['socios'][0]['imoveis'].pop()
            self.cur.reset_mock()
            self.conn.reset_mock()
            self.cur.fetchone.side_effect = None
            self.cur.fetchone.return_value = None
            with patch('models._contexto_equalizacao_consolidada', return_value=contexto):
                with self.assertRaises(SaldoEqualizacaoAlterado): registrar_equalizacao_consolidada(23, 2, self.pedido)
            self.conn.commit.assert_not_called()
            self.conn.rollback.assert_called_once()
            self.assertFalse(any('INSERT INTO' in c.args[0] for c in self.cur.execute.call_args_list))

    def test_retry_idempotente_nao_gera_novas_parcelas(self):
        _, _, fingerprint = _preparar_pedido_equalizacao(self.pedido, 2, 23)
        self.cur.fetchone.return_value = dict(self.operacao, pedido_hash=fingerprint)
        with patch('models._contexto_equalizacao_consolidada') as contexto:
            result = registrar_equalizacao_consolidada(23, 2, self.pedido)
        self.assertTrue(result['repetida'])
        contexto.assert_not_called()
        self.assertFalse(any('INSERT INTO' in c.args[0] for c in self.cur.execute.call_args_list))

    def test_mesma_identificacao_com_outro_usuario_ou_payload_e_rejeitada(self):
        _, _, fingerprint = _preparar_pedido_equalizacao(self.pedido, 2, 23)
        for row, error in [(dict(self.operacao, pedido_hash='outro'), ValueError),
                           (dict(self.operacao, usuario_id=99, pedido_hash=fingerprint), PermissionError)]:
            self.cur.fetchone.return_value = row
            with self.assertRaises(error): registrar_equalizacao_consolidada(23, 2, self.pedido)

    def test_equalizacao_individual_revalida_saldo_sob_mesmo_bloqueio(self):
        self.cur.fetchall.side_effect = [self.socios(23), [self.despesa(2, 200)]]
        _validar_equalizacao_individual(self.cur, 23, 6, 2, 100)
        self.assertEqual(self.cur.execute.call_args_list[0].args, ('SELECT bloquear_financeiro_imovel(%s)', (23,)))
        self.cur.fetchall.side_effect = [self.socios(23), []]
        with self.assertRaisesRegex(ValueError, 'excede o saldo atual'):
            _validar_equalizacao_individual(self.cur, 23, 6, 2, 100)

    def test_falha_de_parcela_reverte_operacao_inteira(self):
        self.cur.fetchone.side_effect = [None, self.operacao]
        def executar(sql, params=None):
            if sql.startswith('INSERT INTO lancamentos'): raise RuntimeError('Falha de escrita')
        self.cur.execute.side_effect = executar
        with patch('models._contexto_equalizacao_consolidada', return_value=self.contexto):
            with self.assertRaises(RuntimeError): registrar_equalizacao_consolidada(23, 2, self.pedido)
        self.conn.commit.assert_not_called()
        self.conn.rollback.assert_called_once()

    def test_compensacao_integral_e_saida_de_dinheiro(self):
        for valor_segundo, esperado, paga, recebe in [(-10000, 0, None, None), (-16000, 60, 2, 6)]:
            self.contexto['socios'][0]['imoveis'][1]['saldo_centavos'] = valor_segundo
            self.cur.fetchone.side_effect = [None, dict(self.operacao, valor_transferido=esperado,
                                                       paid_by_user_id=paga, beneficiary_user_id=recebe)]
            with patch('models._contexto_equalizacao_consolidada', return_value=self.contexto):
                registrar_equalizacao_consolidada(23, 2, self.pedido)
            op = next(c for c in self.cur.execute.call_args_list if c.args[0].startswith('INSERT INTO equalizacao_operacoes'))
            self.assertEqual(op.args[1][6:9], (esperado, paga, recebe))
            self.cur.reset_mock()


if __name__ == '__main__':
    unittest.main()
