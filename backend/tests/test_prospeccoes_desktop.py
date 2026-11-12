import unittest
from unittest.mock import MagicMock, patch
from flask import g
from app import app
from models import listar_prospeccoes_capturados, _normalizar_busca_prospeccao, listar_sugestoes_prospeccao


class ProspeccoesDesktopTestCase(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

        def usuario():
            g.current_user = {'id': 1, 'role': 'admin', 'capabilities': ['admin']}
            return g.current_user

        auth = patch('security._ensure_user_loaded', side_effect=usuario)
        auth.start()
        self.addCleanup(auth.stop)

    def test_rota_encaminha_filtros_sem_alterar_registros(self):
        with patch('app.listar_prospeccoes_capturados', return_value={'data': [], 'total': 0}) as listar:
            response = self.client.get('/prospeccoes/capturados?busca=Barra&lance_min=80000&lance_max=480000&avaliados=sim&oportunidade=1&page_size=100')
        self.assertEqual(response.status_code, 200)
        args = listar.call_args.kwargs
        self.assertEqual(args['lance_min'], 80000)
        self.assertEqual(args['lance_max'], 480000)
        self.assertEqual(args['busca'], 'Barra')
        self.assertTrue(args['avaliados'])
        self.assertTrue(args['oportunidade'])

    def test_rota_rejeita_faixa_invertida_negativa_e_nao_finita(self):
        for query in ['lance_min=200&lance_max=100', 'lance_min=-1', 'lance_max=NaN', 'lance_max=Infinity', 'lance_min=abc', 'avaliados=talvez']:
            with self.subTest(query=query), patch('app.listar_prospeccoes_capturados') as listar:
                self.assertEqual(self.client.get('/prospeccoes/capturados?' + query).status_code, 400)
                listar.assert_not_called()

    @patch('models._garantir_tabela_ai_analise')
    @patch('models.conectar')
    def test_filtros_e_contagem_usam_a_mesma_faixa_no_banco(self, conectar, _garantir):
        connection, cursor = MagicMock(), MagicMock()
        conectar.return_value = connection, cursor
        cursor.fetchone.return_value = [0]
        cursor.fetchall.return_value = []
        listar_prospeccoes_capturados(busca='50%_', cidades=['Sto. Antônio', 'São Paulo'], lance_min=80000, lance_max=480000,
                                     avaliados=False, oportunidade=True, order_by='valor_minimo')
        count_query, count_params = cursor.execute.call_args_list[0].args
        data_query, data_params = cursor.execute.call_args_list[1].args
        for query in (count_query, data_query):
            self.assertIn("CONCAT_WS(' ', cidade, bairro, numero_bem, tipo_imovel, detalhes)", query)
            self.assertIn('melhor_lance >= %s', query)
            self.assertIn('melhor_lance <= %s', query)
            self.assertIn('avaliado = %s', query)
            self.assertIn('ORDER BY valor, data NULLS LAST', query)
        self.assertEqual(data_params[:-2], count_params)
        self.assertIn('%50\\%\\_%', count_params)
        self.assertIn('santo antonio', count_params)
        self.assertIn('sao paulo', count_params)
        self.assertIn('ORDER BY melhor_lance', data_query)
        connection.commit.assert_not_called()

    def test_normaliza_acentos_e_santo_abreviado(self):
        for texto in ['Santo Antônio', 'Santo Antonio', 'sto Antônio', 'Sto. Antônio', 'STO. ANTONIO']:
            self.assertEqual(_normalizar_busca_prospeccao(texto), 'santo antonio')

    @patch('models._garantir_tabela_ai_analise')
    @patch('models.conectar')
    def test_sugestao_tipo_aplica_o_tipo_exato(self, conectar, _garantir):
        connection, cursor = MagicMock(), MagicMock()
        conectar.return_value = connection, cursor
        cursor.fetchone.return_value = [0]
        cursor.fetchall.return_value = []
        listar_prospeccoes_capturados(busca='Casa', busca_campo='tipo')
        query, params = cursor.execute.call_args_list[0].args
        self.assertIn('lower(tipo_imovel)', query)
        self.assertNotIn("CONCAT_WS(' ', cidade", query)
        self.assertIn('casa', params)

    @patch('models.conectar')
    def test_sugestoes_retornam_categorias_e_respeitam_uf(self, conectar):
        connection, cursor = MagicMock(), MagicMock()
        conectar.return_value = connection, cursor
        cursor.fetchall.return_value = [('cidade', 'Santo Antônio')]
        result = listar_sugestoes_prospeccao('sto antonio', ['GO'])
        self.assertEqual(result, [{'categoria': 'cidade', 'valor': 'Santo Antônio'}])
        query, params = cursor.execute.call_args.args
        self.assertIn('LIMIT 8', query)
        self.assertIn(['GO'], params)
        self.assertIn('%santo antonio%', params)
        connection.close.assert_called_once()
        connection.commit.assert_not_called()
