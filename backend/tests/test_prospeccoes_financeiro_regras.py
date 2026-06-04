import unittest
from datetime import datetime, timezone

from models import _montar_resposta_analise_prospeccao, _resolver_pagador_lancamento


class CursorSociosFake:
    def __init__(self, user_ids):
        self._user_ids = user_ids
        self.executed = []

    def execute(self, query, params):
        self.executed.append((query, params))

    def fetchall(self):
        return [{"user_id": user_id} for user_id in self._user_ids]


class ProspeccoesFinanceiroRegrasTestCase(unittest.TestCase):
    def test_despesa_com_um_unico_socio_preenche_pagador_automaticamente(self):
        cur = CursorSociosFake([6])

        resolved = _resolver_pagador_lancamento(cur, id_imovel=23, paid_by_user_id=None, tipo_movimentacao="despesa_imovel")

        self.assertEqual(resolved, 6)

    def test_despesa_com_multiplos_socios_exige_pagador_valido(self):
        cur = CursorSociosFake([6, 7])

        with self.assertRaisesRegex(ValueError, "Informe quem pagou a despesa"):
            _resolver_pagador_lancamento(cur, id_imovel=23, paid_by_user_id=None, tipo_movimentacao="despesa_imovel")

        with self.assertRaisesRegex(ValueError, "Quem pagou precisa ser um sócio ativo"):
            _resolver_pagador_lancamento(cur, id_imovel=23, paid_by_user_id=10, tipo_movimentacao="despesa_imovel")

        self.assertEqual(
            _resolver_pagador_lancamento(cur, id_imovel=23, paid_by_user_id=7, tipo_movimentacao="despesa_imovel"),
            7,
        )

    def test_monta_resposta_manual_para_analise_de_capturado(self):
        now = datetime.now(timezone.utc)
        row = {
            "numero_bem": "1555520929360",
            "valor_maximo": None,
            "link_google_maps": "https://maps.test/1",
            "valor_base_operacao": 123456.0,
            "tempo_operacao_meses": 10,
            "valor_maximo_lance": 100000.0,
            "percentual_financiamento": 20.0,
            "prestacao_mensal_financiamento": 900.0,
            "valor_estimado_venda": 160000.0,
            "reforma": 5000.0,
            "condominio_atraso": 0.0,
            "iptu_atraso": 0.0,
            "desocupacao": 0.0,
            "itbi_percentual": 5.0,
            "itbi_valor": 6172.8,
            "documentacao": 3000.0,
            "manutencao_agua_mensal": 100.0,
            "manutencao_luz_mensal": 100.0,
            "manutencao_condominio_mensal": 200.0,
            "manutencao_iptu_mensal": 50.0,
            "comissao_leiloeiro_percentual": 5.0,
            "comissao_leiloeiro_valor": 5000.0,
            "comissao_corretor_percentual": 6.0,
            "comissao_corretor_valor": 9600.0,
            "ganho_capital_percentual": 15.0,
            "ganho_capital_valor": 0.0,
            "created_by": 1,
            "created_by_name": "Codex",
            "updated_by": 1,
            "updated_by_name": "Codex",
            "created_at": now,
            "updated_at": now,
            "valor_venda": 130000.0,
            "valor_avaliacao": 150000.0,
            "financia": True,
            "avaliacao_numero_bem": None,
            "preco_m2_regiao": None,
            "fonte_pesquisa": None,
            "avaliacao_valor_estimado_venda": None,
            "custo_aquisicao_est": None,
            "custo_reforma_est": None,
            "custo_desocupacao_est": None,
            "lucro_estimado": None,
            "retorno_pct": None,
            "score_total": None,
            "score_desconto": None,
            "score_liquidez": None,
            "score_risco": None,
            "score_regiao": None,
            "resumo_ia": None,
            "pesquisado_em": None,
        }

        result = _montar_resposta_analise_prospeccao(row, "1555520929360")

        self.assertEqual(result["numero_bem"], "1555520929360")
        self.assertEqual(result["meta"]["prefill_source"], "manual_existente")
        self.assertEqual(result["inputs"]["valor_base_operacao"], 123456.0)
        self.assertEqual(result["inputs"]["valor_maximo_lance"], 100000.0)
        self.assertEqual(result["meta"]["updated_by_name"], "Codex")
        self.assertIn("roi_esperado_percentual", result["calculos"])


if __name__ == "__main__":
    unittest.main()
