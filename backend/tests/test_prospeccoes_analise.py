import unittest
from collections import defaultdict

from models import calcular_analise_prospeccao, _montar_resposta_analise_prospeccao


class ProspecoesAnaliseTestCase(unittest.TestCase):
    def test_venda_ausente_ou_zero_legado_deixa_resultado_pendente(self):
        for venda in (None, "", 0, "0.00"):
            with self.subTest(venda=venda):
                calculada = calcular_analise_prospeccao({
                    "valor_maximo_lance": 100000,
                    "valor_estimado_venda": venda,
                    "reforma": 10000,
                })
                self.assertTrue(calculada["venda_estimada_pendente"])
                self.assertIsNone(calculada["valor_estimado_venda"])
                self.assertIsNone(calculada["lucro_esperado_valor"])
                self.assertIsNone(calculada["roi_esperado_percentual"])
                self.assertIsNone(calculada["base_ganho_capital"])
                self.assertEqual(calculada["custo_total_imovel"], 110000)

    def test_ficha_inicial_e_ficha_antiga_sinalizam_venda_pendente(self):
        for venda, base in ((None, None), (0, 100000)):
            with self.subTest(venda=venda):
                row = defaultdict(lambda: None, {
                    "numero_bem": "TESTE",
                    "lance_recomendado": 100000,
                    "valor_base_operacao": base,
                    "valor_estimado_venda": venda,
                })
                resposta = _montar_resposta_analise_prospeccao(row, "TESTE")
                self.assertTrue(resposta["calculos"]["venda_estimada_pendente"])
                self.assertIsNone(resposta["inputs"]["valor_estimado_venda"])
                self.assertIsNone(resposta["calculos"]["lucro_esperado_valor"])

    def test_resultado_zero_com_venda_informada_e_calculo_concluido(self):
        calculada = calcular_analise_prospeccao({
            "valor_maximo_lance": 100000,
            "valor_estimado_venda": 100000,
        })
        self.assertFalse(calculada["venda_estimada_pendente"])
        self.assertEqual(calculada["lucro_esperado_valor"], 0)
        self.assertEqual(calculada["roi_esperado_percentual"], 0)

    def test_calculo_considera_financiamento_nos_totais_e_roi(self):
        calculada = calcular_analise_prospeccao(
            {
                "valor_base_operacao": 100000,
                "valor_maximo_lance": 100000,
                "percentual_financiamento": 50,
                "prestacao_mensal_financiamento": 1000,
                "tempo_operacao_meses": 12,
                "valor_estimado_venda": 160000,
                "reforma": 10000,
                "condominio_atraso": 2000,
                "iptu_atraso": 1000,
                "desocupacao": 3000,
                "documentacao": 4000,
                "itbi_percentual": 5,
                "manutencao_agua_mensal": 100,
                "manutencao_luz_mensal": 200,
                "manutencao_condominio_mensal": 300,
                "manutencao_iptu_mensal": 400,
                "comissao_leiloeiro_percentual": 5,
                "comissao_corretor_percentual": 6,
            }
        )

        self.assertEqual(calculada["itbi_valor"], 5000.0)
        self.assertEqual(calculada["comissao_leiloeiro_valor"], 5000.0)
        self.assertEqual(calculada["comissao_corretor_valor"], 9600.0)
        self.assertEqual(calculada["despesas_unicas"], 25000.0)
        self.assertEqual(calculada["despesa_mensal_operacional"], 1000.0)
        self.assertEqual(calculada["custo_financiamento_projetado"], 12000.0)
        self.assertEqual(calculada["despesa_mensal_total"], 2000.0)
        self.assertEqual(calculada["despesas_mensais_projetadas"], 24000.0)
        self.assertEqual(calculada["valor_financiado"], 50000.0)
        self.assertEqual(calculada["desembolso_aquisicao"], 55000.0)
        self.assertEqual(calculada["custo_total_imovel"], 154000.0)
        self.assertEqual(calculada["capital_investido_estimado"], 104000.0)
        self.assertEqual(calculada["lucro_esperado_valor"], -3600.0)
        self.assertEqual(calculada["roi_esperado_percentual"], -3.4615)


if __name__ == "__main__":
    unittest.main()
