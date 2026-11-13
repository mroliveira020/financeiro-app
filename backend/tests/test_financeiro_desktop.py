import unittest
from unittest.mock import MagicMock, patch
from datetime import date
from flask import Flask, g
from models import listar_lancamentos_imovel
from dashboard import dashboard_bp


class FinanceiroDesktopTest(unittest.TestCase):
    def test_filtros_parametrizados_e_totais_no_mesmo_snapshot(self):
        conn, cur = MagicMock(), MagicMock()
        cur.fetchone.return_value = {'items': [], 'total': 35, 'pendentes': 2, 'soma': 150.5}
        with patch('models.conectar', return_value=(conn, cur)):
            resultado = listar_lancamentos_imovel(24, filtros={
                'busca': "%' OR 1=1 --", 'categoria': '2', 'pagador': '6',
                'inicio': '2026-11-01', 'fim': '2026-11-13', 'situacao': 'confirmado',
            }, limit=30, page=2)
        sql, params = cur.execute.call_args.args
        self.assertEqual(cur.execute.call_count, 1)
        self.assertNotIn("%' OR", sql)
        self.assertIn('ativo IS DISTINCT FROM FALSE', sql)
        self.assertIn('COALESCE(id_situacao, 0) = 1', sql)
        self.assertIn("<> 'equalizacao_socios'", sql)
        self.assertIn('FILTER (WHERE confirmado)', sql)
        self.assertEqual(params, (24, "%' OR 1=1 --", 2, 6, date(2026, 11, 1), date(2026, 11, 13), True, 30, 30))
        self.assertEqual(resultado['summary'], {'total': 35, 'pendentes': 2, 'soma': 150.5})
        conn.close.assert_called_once()

    def test_rejeita_filtros_invalidos_antes_de_abrir_banco(self):
        with patch('models.conectar') as conectar:
            for filtros in [{'inicio': 'ontem'}, {'categoria': '-1'}, {'pagador': 'abc'}, {'situacao': 'qualquer'}, {'inicio': '2026-11-13', 'fim': '2026-11-01'}]:
                with self.subTest(filtros=filtros), self.assertRaises(ValueError):
                    listar_lancamentos_imovel(24, filtros=filtros)
            conectar.assert_not_called()

    def test_fecha_conexao_apos_falha(self):
        conn, cur = MagicMock(), MagicMock()
        cur.execute.side_effect = RuntimeError('falha simulada')
        with patch('models.conectar', return_value=(conn, cur)), self.assertRaises(RuntimeError):
            listar_lancamentos_imovel(24)
        conn.close.assert_called_once()

    def test_rota_respeita_acesso_e_propaga_filtros(self):
        app = Flask(__name__)
        app.register_blueprint(dashboard_bp)
        with app.test_request_context('/dashboard/lancamentos/imovel/24?categoria=2'):
            g.current_user = {'id': 6, 'role': 'socio', 'finance_access': True}
            from dashboard.routes import get_lancamentos_imovel
            with patch('dashboard.routes._usuario_pode_acessar_imovel_financeiro', return_value=False), patch('dashboard.routes.listar_lancamentos_imovel') as listar:
                resposta = get_lancamentos_imovel.__wrapped__.__wrapped__(24)
                self.assertEqual(resposta[1], 403)
                listar.assert_not_called()


if __name__ == '__main__':
    unittest.main()
