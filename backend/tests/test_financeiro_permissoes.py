import unittest

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
    def test_helpers_de_escopo_financeiro(self):
        self.assertTrue(user_has_global_finance_access("admin"))
        self.assertFalse(user_has_global_finance_access("prospector"))

        self.assertTrue(user_has_finance_access(2, "admin"))
        self.assertTrue(user_has_finance_access(6, "prospector"))
        self.assertFalse(user_has_finance_access(4, "prospector"))

        self.assertEqual(get_finance_access_scope(2, "admin"), "global")
        self.assertEqual(get_finance_access_scope(6, "prospector"), "restricted")
        self.assertEqual(get_finance_access_scope(4, "prospector"), "none")

    def test_prospector_marco_ve_apenas_imovel_vinculado(self):
        imoveis = listar_imoveis_financeiro_acessiveis(viewer_user_id=6, viewer_role="prospector")

        ids = {item["id"] for item in imoveis}

        self.assertEqual(ids, {23})
        self.assertTrue(usuario_participa_imovel(23, 6))
        self.assertFalse(usuario_participa_imovel(1, 6))
        self.assertFalse(usuario_participa_imovel(2, 6))
        self.assertFalse(usuario_participa_imovel(3, 6))

    def test_agregados_financeiros_respeitam_escopo_do_prospector(self):
        ids = [item["id"] for item in listar_imoveis_financeiro_acessiveis(viewer_user_id=6, viewer_role="prospector")]

        data_ultima = obter_data_ultima_atualizacao(ids)
        ultimos = listar_ultimos_lancamentos_confirmados(10, ids)
        gastos = listar_totais_mensais_por_imovel(6, [8, 15, 18], True, ids)
        resumo = listar_resumo_imoveis(True, ids)

        self.assertEqual(ids, [23])
        self.assertIsNotNone(data_ultima)
        self.assertTrue(ultimos)
        self.assertTrue(gastos)
        self.assertEqual({item["imovel"] for item in ultimos}, {"Araruna PR"})
        self.assertEqual({item["id_imovel"] for item in gastos}, {23})
        self.assertEqual({item["nome_imovel"] for item in gastos}, {"Araruna PR"})
        self.assertEqual(resumo["totais"]["imoveis_considerados"], 1)


if __name__ == "__main__":
    unittest.main()
