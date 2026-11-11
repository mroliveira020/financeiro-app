"""Regressão transacional; todos os imóveis e acertos fictícios recebem ROLLBACK."""
import argparse
from pathlib import Path
import sys
from unittest.mock import patch
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from dotenv import load_dotenv
load_dotenv(ROOT / 'backend' / '.env')
from db_connection import conectar
import models


def validar(validar_migracao=False):
    conn, cur = conectar()
    try:
        cur.execute("SET LOCAL statement_timeout = '15s'")
        if validar_migracao:
            sql = (ROOT / 'docs/sql_equalizacao_consolidada.sql').read_text()
            cur.execute(sql.replace('BEGIN;', '', 1).removesuffix('COMMIT;\n'))
        cur.execute('SELECT id FROM users ORDER BY id LIMIT 2')
        usuario, socio = [r[0] for r in cur.fetchall()]
        ids = [1900000001, 1900000002]
        cur.execute('SELECT id FROM imoveis WHERE id=ANY(%s)', (ids,))
        assert not cur.fetchall(), 'IDs de teste já existem; escolha outros antes de executar.'
        for imovel in ids:
            cur.execute('INSERT INTO imoveis(id,nome,vendido) VALUES (%s,%s,FALSE)', (imovel, f'TESTE TRANSACIONAL {imovel}'))
            for user_id in (usuario, socio):
                cur.execute('INSERT INTO imovel_socios(id_imovel,user_id,percentual_participacao,ativo) VALUES (%s,%s,50,TRUE)', (imovel, user_id))
        def despesa(imovel, user_id, valor):
            cur.execute('''INSERT INTO lancamentos(data,id_imovel,id_categoria,id_situacao,descricao,valor,ativo,paid_by_user_id,tipo_movimentacao)
                VALUES (CURRENT_DATE,%s,0,1,'TESTE TRANSACIONAL',%s,TRUE,%s,'despesa_imovel')''', (imovel, valor, user_id))
        class SemCommit:
            def commit(self): pass
            def rollback(self): pass
            def close(self): pass
        def pedido():
            contexto = models._contexto_equalizacao_consolidada(cur, ids[0], usuario)
            grupo = next(g for g in contexto['socios'] if g['socio_id'] == socio)
            return {'operacao_id': str(uuid.uuid4()), 'socio_id': socio, 'data': '2026-11-11',
                    'imoveis': [{'id_imovel': i['id_imovel'], 'versao': i['versao']} for i in grupo['imoveis'] if i['id_imovel'] in ids]}
        despesa(ids[0], usuario, 200)
        despesa(ids[1], socio, 120)
        with patch('models.conectar', return_value=(SemCommit(), cur)):
            primeiro = pedido()
            resultado = models.registrar_equalizacao_consolidada(ids[0], usuario, primeiro)
            assert resultado['valor_transferido'] == 40
            assert resultado['paid_by_user_id'] == socio
            cur.execute('SET CONSTRAINTS ALL IMMEDIATE')
            cur.execute('SET CONSTRAINTS ALL DEFERRED')
            repetido = models.registrar_equalizacao_consolidada(ids[0], usuario, primeiro)
            assert repetido['repetida']
            cur.execute('SELECT count(*) FROM lancamentos WHERE equalizacao_operacao_id=%s', (resultado['operacao_id'],))
            assert cur.fetchone()[0] == 2
            contexto = models._contexto_equalizacao_consolidada(cur, ids[0], usuario)
            assert not any(i['id_imovel'] in ids for g in contexto['socios'] for i in g['imoveis'])
            try:
                models._validar_equalizacao_individual(cur, ids[0], socio, usuario, 100)
                raise AssertionError('Equalização individual após quitação deveria falhar')
            except ValueError:
                print('Equalização individual não repete saldo já quitado: OK')
            gastos = models.listar_totais_mensais_por_imovel(id_imoveis_permitidos=ids)
            assert sum(i['total'] for i in gastos) == 320
            print('Gastos mensais mantêm apenas despesas, sem as parcelas do acerto: OK')
            print('Transferência líquida, parcelas, quitação e idempotência: OK')
            try:
                models.registrar_equalizacao_consolidada(ids[0], usuario, dict(primeiro, operacao_id=str(uuid.uuid4())))
                raise AssertionError('Uma confirmação com saldos antigos deveria falhar')
            except models.SaldoEqualizacaoAlterado:
                print('Saldo antigo rejeitado: OK')
            cur.execute('SAVEPOINT preservar_parcela')
            try:
                cur.execute('UPDATE lancamentos SET valor=1 WHERE equalizacao_operacao_id=%s', (resultado['operacao_id'],))
                raise AssertionError('Não deveria permitir alterar parcela individual')
            except Exception as exc:
                if isinstance(exc, AssertionError): raise
                cur.execute('ROLLBACK TO SAVEPOINT preservar_parcela')
                print('Histórico da parcela protegido: OK')
            for segundo, esperado in [(200, 0), (300, 50)]:
                despesa(ids[0], usuario, 200)
                despesa(ids[1], socio, segundo)
                result = models.registrar_equalizacao_consolidada(ids[0], usuario, pedido())
                assert result['valor_transferido'] == esperado
                if esperado == 0: assert result['paid_by_user_id'] is None
                else: assert result['paid_by_user_id'] == usuario
            cur.execute('SET CONSTRAINTS ALL IMMEDIATE')
            cur.execute('SET CONSTRAINTS ALL DEFERRED')
            print('Compensação integral e saldo líquido a pagar: OK')
        cur.execute('SAVEPOINT acerto_incompleto')
        try:
            cur.execute("""INSERT INTO equalizacao_operacoes
                (id,usuario_id,socio_id,origem_imovel_id,data,valor_transferido,paid_by_user_id,beneficiary_user_id,itens,pedido_hash)
                VALUES (%s,%s,%s,%s,CURRENT_DATE,40,%s,%s,%s::jsonb,'teste-incompleto')""",
                (str(uuid.uuid4()),usuario,socio,ids[0],socio,usuario,
                 '[{"id_imovel":1900000001,"saldo_centavos":10000},{"id_imovel":1900000002,"saldo_centavos":-6000}]'))
            cur.execute('SET CONSTRAINTS ALL IMMEDIATE')
            raise AssertionError('Operação sem parcelas deveria falhar')
        except Exception as exc:
            if isinstance(exc, AssertionError): raise
            cur.execute('ROLLBACK TO SAVEPOINT acerto_incompleto')
            cur.execute('SET CONSTRAINTS ALL DEFERRED')
            print('Operação incompleta rejeitada pelo banco: OK')
        outro, cursor_outro = conectar()
        try:
            cursor_outro.execute("SELECT pg_try_advisory_xact_lock(hashtextextended(%s,0))", (f'financeiro_imovel:{ids[0]}',))
            assert cursor_outro.fetchone()[0] is False
            print('Bloqueio financeiro impede escrita concorrente de outra transação: OK')
        finally:
            outro.close()
    finally:
        conn.rollback()
        conn.close()
        print('ROLLBACK concluído; nenhum acerto de teste foi mantido.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--validar-migracao', action='store_true')
    validar(parser.parse_args().validar_migracao)
