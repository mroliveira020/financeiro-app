import unittest
from unittest.mock import patch

from models import _contexto_oferta_resposta, _montar_resposta_analise_prospeccao


class ProspecoesOfertaTestCase(unittest.TestCase):
    def test_presenca_desconhecida_nao_e_indisponibilidade(self):
        result = _contexto_oferta_resposta({})
        self.assertIsNone(result['presente_ultima_captura'])
        self.assertFalse(result['precisa_revisao'])

    def test_alerta_preserva_motivo_e_preco_da_etapa(self):
        result = _contexto_oferta_resposta({
            'contexto_oferta': {
                'presente_ultima_captura': False,
                'etapa_recomendada': '2º Leilão',
                'lance_recomendado': 150000,
                'data_recomendada': None,
            },
            'motivos_revisao': ['Condições mudaram'],
        })
        self.assertTrue(result['precisa_revisao'])
        self.assertFalse(result['presente_ultima_captura'])
        self.assertIsNone(result['data_recomendada'])
        self.assertEqual(result['lance_recomendado'], 150000)

    @patch('models.calcular_analise_prospeccao', return_value={})
    @patch('models._build_prefill_analise_motor2')
    def test_ficha_inicial_usa_lance_da_etapa_recomendada(self, prefill, _calculo):
        # O restante da resposta depende de cálculos já cobertos nos testes financeiros.
        class FakeInputs(dict):
            def __getitem__(self, key):
                return 0
        prefill.return_value = FakeInputs()
        row = dict.fromkeys([
            'valor_base_operacao', 'valor_estimado_venda', 'avaliacao_numero_bem',
            'created_by', 'created_by_name', 'updated_by', 'updated_by_name',
            'created_at', 'updated_at',
        ])
        row.update(lance_recomendado=150000, valor_venda=200000, valor_avaliacao=300000, financia=True)
        _montar_resposta_analise_prospeccao(row, '123')
        self.assertEqual(prefill.call_args.args[0]['valor_venda'], 150000)
        self.assertIsNone(prefill.call_args.args[0]['valor_avaliacao'])
