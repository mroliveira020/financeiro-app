import unittest

from models import calcular_analise_prospeccao


class ProspecoesAnaliseTestCase(unittest.TestCase):
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
