import base64
import os
import uuid
from collections import defaultdict
from functools import lru_cache
from db_connection import conectar
import json


UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "static", "imoveis")
STATIC_URL_PREFIX = "/static/imoveis"


def _to_float(valor):
    try:
        return float(valor or 0)
    except (TypeError, ValueError):
        return 0.0


def _total_estimado(item):
    if not item:
        return 0.0
    orcamento = _to_float(item.get("orcamento"))
    efetivado = _to_float(item.get("valor_efetivado"))
    em_contratacao = _to_float(item.get("valor_em_contratacao"))
    return max(orcamento, efetivado + em_contratacao)


def _metricas_por_imovel(registros):
    if not registros:
        return {
            "valor_efetivado": 0.0,
            "valor_a_investir": 0.0,
            "lucro_projetado": 0.0,
            "ativo_esperado": 0.0,
            "roi_projetado": 0.0,
            "investimento_total": 0.0,
        }

    grupos_base = [r for r in registros if r.get("id_grupo") not in (6, 7, 8, 9)]

    valor_efetivado = sum(_to_float(r.get("valor_efetivado")) for r in grupos_base)
    investimento_total = sum(_total_estimado(r) for r in grupos_base)
    valor_a_investir = sum(_total_estimado(r) - _to_float(r.get("valor_efetivado")) for r in grupos_base)

    def _total_grupo(numero):
        registro = next((r for r in registros if r.get("id_grupo") == numero), None)
        return _total_estimado(registro)

    total_grupo6 = _total_grupo(6)
    total_grupo7 = _total_grupo(7)
    total_grupo8 = _total_grupo(8)
    total_grupo9 = _total_grupo(9)

    custo_do_imovel = investimento_total + total_grupo6
    valor_de_venda = total_grupo8
    corretor = total_grupo7

    ganho_capital_base = valor_de_venda - custo_do_imovel - corretor
    ir_ganho_capital = max(
        total_grupo9,
        ganho_capital_base * 0.15 if ganho_capital_base > 0 else 0.0,
    )

    lucro_projetado = valor_de_venda - custo_do_imovel - corretor - ir_ganho_capital
    roi_projetado = (lucro_projetado / investimento_total) if investimento_total else 0.0
    ativo_esperado = valor_efetivado + valor_a_investir + lucro_projetado

    return {
        "valor_efetivado": valor_efetivado,
        "valor_a_investir": valor_a_investir,
        "lucro_projetado": lucro_projetado,
        "ativo_esperado": ativo_esperado,
        "roi_projetado": roi_projetado,
        "investimento_total": investimento_total,
    }


@lru_cache(maxsize=1)
def _garantir_coluna_foto():
    conn, cur = conectar()
    try:
        cur.execute("ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS foto_url TEXT")
        conn.commit()
    except Exception:
        conn.rollback()
    finally:
        conn.close()


def _remover_foto(caminho_url):
    if not caminho_url:
        return
    nome_arquivo = os.path.basename(caminho_url)
    caminho_arquivo = os.path.join(UPLOAD_DIR, nome_arquivo)
    if os.path.exists(caminho_arquivo):
        try:
            os.remove(caminho_arquivo)
        except OSError:
            pass


def _salvar_foto_base64(imovel_id, data_uri, foto_atual=None):
    if not data_uri or "," not in data_uri:
        return foto_atual

    cabecalho, conteudo = data_uri.split(",", 1)
    if "base64" not in cabecalho:
        return foto_atual

    mime_type = cabecalho.split(";")[0].split(":")[-1].lower()
    extensao = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/webp": "webp",
    }.get(mime_type, "jpg")

    try:
        dados = base64.b64decode(conteudo)
    except (base64.binascii.Error, ValueError):
        return foto_atual

    os.makedirs(UPLOAD_DIR, exist_ok=True)

    nome_arquivo = f"imovel_{imovel_id}_{uuid.uuid4().hex[:8]}.{extensao}"
    caminho_arquivo = os.path.join(UPLOAD_DIR, nome_arquivo)

    try:
        with open(caminho_arquivo, "wb") as arquivo:
            arquivo.write(dados)
    except OSError:
        return foto_atual

    if foto_atual:
        _remover_foto(foto_atual)

    return f"{STATIC_URL_PREFIX}/{nome_arquivo}"


# ======================================================
# 🔹 Funções para a tabela IMOVEIS
# ======================================================

def listar_imoveis():
    _garantir_coluna_foto()
    conn, cur = conectar()
    try:
        cur.execute("""
            SELECT
                im.id,
                im.nome,
                im.vendido,
                COALESCE(totais.total_investido, 0) AS total_investido,
                totais.periodo_inicio,
                totais.periodo_fim,
                COALESCE(grupos.lista, '[]'::jsonb) AS grupos,
                im.foto_url
            FROM imoveis im
            LEFT JOIN LATERAL (
                SELECT
                    COALESCE(SUM(l.valor), 0) AS total_investido,
                    MIN(l.data) AS periodo_inicio,
                    MAX(l.data) AS periodo_fim
                FROM lancamentos l
                LEFT JOIN categorias c ON c.id = l.id_categoria
                WHERE l.id_imovel = im.id
                  AND l.id_situacao = 1
                  AND (l.ativo IS DISTINCT FROM FALSE)
                  AND (c.id IS NULL OR c.id NOT IN (4, 8, 15, 18))
            ) totais ON TRUE
            LEFT JOIN LATERAL (
                SELECT jsonb_agg(jsonb_build_object('grupo', grupo, 'total', total) ORDER BY grupo) AS lista
                FROM (
                    SELECT
                        g.grupo,
                        SUM(l.valor) AS total
                    FROM lancamentos l
                    JOIN categorias c ON c.id = l.id_categoria
                    JOIN grupos g ON g.id = c.id_grupo
                    WHERE l.id_imovel = im.id
                      AND l.id_situacao = 1
                      AND (l.ativo IS DISTINCT FROM FALSE)
                      AND (c.id IS NULL OR c.id NOT IN (4, 8, 15, 18))
                    GROUP BY g.grupo
                    ORDER BY g.grupo
                ) dados
            ) grupos ON TRUE
            ORDER BY im.created_at DESC
        """)
        resultados = cur.fetchall()

        ids = [row["id"] for row in resultados]
        registros_por_imovel = defaultdict(list)

        if ids:
            cur.execute(
                """
                    SELECT
                        id_imovel,
                        id_grupo,
                        grupo,
                        valor_efetivado,
                        valor_em_contratacao,
                        valor_total,
                        orcamento
                    FROM vw_orcamento_execucao
                    WHERE id_imovel = ANY(%s)
                """,
                (ids,),
            )

            for registro in cur.fetchall():
                registros_por_imovel[registro["id_imovel"]].append(dict(registro))

        imoveis = []
        for row in resultados:
            item = dict(row)
            grupos = item.get("grupos")
            if isinstance(grupos, str):
                try:
                    grupos = json.loads(grupos)
                except json.JSONDecodeError:
                    grupos = []
            elif grupos is None:
                grupos = []
            item["grupos"] = grupos

            metricas = _metricas_por_imovel(registros_por_imovel.get(item["id"], []))
            for chave, valor in metricas.items():
                item[chave] = float(valor)

            total_investido = _to_float(item.get("total_investido"))
            if total_investido == 0 and metricas["valor_efetivado"]:
                total_investido = float(metricas["valor_efetivado"])
            item["total_investido"] = total_investido
            item["totalInvestido"] = total_investido

            imoveis.append(item)

        return imoveis
    finally:
        conn.close()

def adicionar_imovel(nome, vendido):
    _garantir_coluna_foto()
    conn, cur = conectar()
    cur.execute("""
        INSERT INTO imoveis (nome, vendido) 
        VALUES (%s, %s) 
        RETURNING id
    """, (nome, vendido))
    imovel_id = cur.fetchone()[0]
    conn.commit()
    conn.close()
    return {"id": imovel_id, "nome": nome, "vendido": vendido, "foto_url": None}

def buscar_imovel_por_id(imovel_id):
    _garantir_coluna_foto()
    conn, cur = conectar()
    cur.execute("""
        SELECT id, created_at, nome, vendido, ganho_capital, corretagem, valor_venda, "bAtivo",
               endereco, cpf_ocupante, nome_ocupante, latitude, longitude, foto_url
        FROM imoveis
        WHERE id = %s
    """, (imovel_id,))
    
    resultado = cur.fetchone()
    if resultado:
        colunas = [desc[0] for desc in cur.description]
        conn.close()
        return dict(zip(colunas, resultado))
    
    conn.close()
    return None

def atualizar_imovel(
    imovel_id,
    nome=None,
    vendido=None,
    endereco=None,
    nome_ocupante=None,
    cpf_ocupante=None,
    latitude=None,
    longitude=None,
    corretagem=None,
    ganho_capital=None,
    valor_venda=None,
    foto_base64=None,
    remover_foto=False,
):
    _garantir_coluna_foto()
    imovel = buscar_imovel_por_id(imovel_id)
    if not imovel:
        return None

    nome = nome if nome is not None else imovel["nome"]
    vendido = vendido if vendido is not None else imovel["vendido"]
    endereco = endereco if endereco is not None else imovel["endereco"]
    nome_ocupante = nome_ocupante if nome_ocupante is not None else imovel["nome_ocupante"]

    cpf_ocupante = cpf_ocupante.strip() if cpf_ocupante else None
    latitude = float(latitude) if latitude not in (None, '', ' ') else imovel.get("latitude")
    longitude = float(longitude) if longitude not in (None, '', ' ') else imovel.get("longitude")
    corretagem = float(str(corretagem).replace(',', '.')) if corretagem not in (None, '', ' ') else imovel.get("corretagem")
    ganho_capital = float(str(ganho_capital).replace(',', '.')) if ganho_capital not in (None, '', ' ') else imovel.get("ganho_capital")
    valor_venda = float(str(valor_venda).replace(',', '.')) if valor_venda not in (None, '', ' ') else imovel.get("valor_venda")

    foto_atual = imovel.get("foto_url")
    nova_foto_url = foto_atual
    if foto_base64:
        nova_foto_url = _salvar_foto_base64(imovel_id, foto_base64, foto_atual)
    elif remover_foto and foto_atual:
        _remover_foto(foto_atual)
        nova_foto_url = None

    conn, cur = conectar()
    cur.execute("""
        UPDATE imoveis
        SET nome = %s,
            vendido = %s,
            endereco = %s,
            nome_ocupante = %s,
            cpf_ocupante = %s,
            latitude = %s,
            longitude = %s,
            corretagem = %s,
            ganho_capital = %s,
            valor_venda = %s,
            foto_url = %s
        WHERE id = %s
    """, (
        nome, vendido, endereco, nome_ocupante, cpf_ocupante,
        latitude, longitude, corretagem, ganho_capital, valor_venda,
        nova_foto_url, imovel_id
    ))

    conn.commit()
    conn.close()

    return {
        "id": imovel_id,
        "nome": nome,
        "vendido": vendido,
        "endereco": endereco,
        "nome_ocupante": nome_ocupante,
        "cpf_ocupante": cpf_ocupante,
        "latitude": latitude,
        "longitude": longitude,
        "corretagem": corretagem,
        "ganho_capital": ganho_capital,
        "valor_venda": valor_venda,
        "foto_url": nova_foto_url,
    }

def deletar_imovel(imovel_id):
    conn, cur = conectar()
    cur.execute("DELETE FROM imoveis WHERE id = %s", (imovel_id,))
    conn.commit()
    conn.close()
    return {"message": f"Imóvel {imovel_id} deletado com sucesso"}

# ======================================================
# 🔹 Funções para a tabela CATEGORIAS
# ======================================================

def listar_categorias():
    conn, cur = conectar()
    cur.execute("SELECT * FROM categorias ORDER BY created_at DESC")
    resultados = cur.fetchall()
    conn.close()
    return [dict(row) for row in resultados]

def adicionar_categoria(categoria, dc):
    conn, cur = conectar()
    cur.execute("""
        INSERT INTO categorias (categoria, dc) 
        VALUES (%s, %s) 
        RETURNING id
    """, (categoria, dc))
    categoria_id = cur.fetchone()[0]
    conn.commit()
    conn.close()
    return {"id": categoria_id, "categoria": categoria, "dc": dc}

def deletar_categoria(categoria_id):
    conn, cur = conectar()
    cur.execute("DELETE FROM categorias WHERE id = %s", (categoria_id,))
    conn.commit()
    conn.close()
    return {"message": f"Categoria {categoria_id} deletada com sucesso"}

# ======================================================
# 🔹 Funções para a tabela LANCAMENTOS
# ======================================================

def listar_lancamentos():
    conn, cur = conectar()
    cur.execute("SELECT * FROM lancamentos ORDER BY data DESC")
    resultados = cur.fetchall()
    conn.close()
    return [dict(row) for row in resultados]

def adicionar_lancamento(data, id_imovel, id_categoria, id_situacao, descricao, valor, ativo):
    conn, cur = conectar()
    cur.execute("""
        INSERT INTO lancamentos (data, id_imovel, id_categoria, id_situacao, descricao, valor, ativo) 
        VALUES (%s, %s, %s, %s, %s, %s, %s) 
        RETURNING id
    """, (data, id_imovel, id_categoria, id_situacao, descricao, valor, ativo))
    lancamento_id = cur.fetchone()[0]
    conn.commit()
    conn.close()
    return {"id": lancamento_id, "descricao": descricao, "valor": valor}

def adicionar_lancamentos_em_lote(lista_lancamentos):
    """Adiciona uma lista de lançamentos em lote, aceitando datas em
    DD/MM/YYYY ou YYYY-MM-DD, persistindo sempre em ISO (YYYY-MM-DD)."""
    conn, cur = conectar()

    query = """
        INSERT INTO lancamentos (data, id_imovel, id_categoria, id_situacao, descricao, valor, ativo)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """

    for lancamento in lista_lancamentos:
        # Normaliza a data para ISO usando o conversor padrão
        data_str = lancamento.get('data', '').strip()
        data_formatada = converter_data(data_str)

        cur.execute(query, (
            data_formatada,
            lancamento['id_imovel'],
            lancamento.get('id_categoria', 0),
            lancamento.get('id_situacao', 1),
            lancamento['descricao'],
            lancamento['valor'],
            True  # ativo
        ))

    conn.commit()
    conn.close()

    return len(lista_lancamentos)

def excluir_lancamento(id_lancamento):
    conn, cur = conectar()

    try:
        with conn.cursor() as cur:
            query = "DELETE FROM lancamentos WHERE id = %s"
            cur.execute(query, (id_lancamento,))
        
        conn.commit()
        print(f"Lançamento {id_lancamento} excluído com sucesso.")

    except Exception as e:
        conn.rollback()
        print(f"Erro ao excluir lançamento: {e}")
        raise e

    finally:
        conn.close()

# ======================================================
# 🔹 Funções para Dashboard - Lançamentos Views
# ======================================================

def listar_lancamentos_completos_view(id_imovel):
    conn, cur = conectar()
    cur.execute("""
        SELECT * FROM vw_lancamentos_completos
        WHERE id_imovel = %s
        ORDER BY data DESC
    """, (id_imovel,))
    resultados = cur.fetchall()
    conn.close()

    lista_tratada = []
    for row in resultados:
        linha = dict(row)
        data_obj = linha.get('data')
        if data_obj:
            linha['data'] = data_obj.strftime('%d/%m/%Y')
        lista_tratada.append(linha)

    return lista_tratada

def listar_lancamentos_incompletos_view(id_imovel):
    conn, cur = conectar()
    cur.execute("""
        SELECT * FROM vw_lancamentos_incompletos
        ORDER BY data DESC
    """, (id_imovel,))
    resultados = cur.fetchall()
    conn.close()

    lista_tratada = []
    for row in resultados:
        linha = dict(row)
        data_obj = linha.get('data')
        if data_obj:
            linha['data'] = data_obj.strftime('%d/%m/%Y')
        lista_tratada.append(linha)

    return lista_tratada

# ======================================================
# 🔹 Funções Resumo Financeiro
# ======================================================

def listar_resumo_financeiro(id_imovel):
    conn, cur = conectar()
    cur.execute("""
        SELECT id_imovel, id_grupo, grupo, valor_efetivado, valor_em_contratacao, valor_total, orcamento
        FROM vw_orcamento_execucao
        WHERE id_imovel = %s
    """, (id_imovel,))
    resultados = cur.fetchall()
    colunas = [desc[0] for desc in cur.description]
    conn.close()

    return [dict(zip(colunas, row)) for row in resultados]

# ======================================================
# 🔹 Funções auxiliares — Atualização e últimos lançamentos
# ======================================================

def obter_data_ultima_atualizacao():
    """Retorna a maior data entre lançamentos confirmados (id_situacao = 1)
    com data menor ou igual à data atual. Retorna string DD/MM/AAAA ou None."""
    conn, cur = conectar()
    cur.execute(
        """
        SELECT MAX(data) AS ultima_data
        FROM lancamentos
        WHERE id_situacao = 1
          AND data <= CURRENT_DATE
        """
    )
    row = cur.fetchone()
    conn.close()
    if not row or not row[0]:
        return None
    try:
        return row[0].strftime('%d/%m/%Y')
    except Exception:
        # Se vier como string ISO
        s = str(row[0])
        if '-' in s:
            partes = s.split('-')
            if len(partes) == 3:
                return f"{partes[2]}/{partes[1]}/{partes[0]}"
        return s


def listar_ultimos_lancamentos_confirmados(limit=10):
    """Lista os últimos lançamentos confirmados (id_situacao = 1),
    com data <= hoje, ordenados por data desc (e id desc), com nome do imóvel e categoria."""
    try:
        limit = int(limit)
    except Exception:
        limit = 10
    if limit < 1:
        limit = 1
    if limit > 50:
        limit = 50

    conn, cur = conectar()
    cur.execute(
        """
        SELECT l.data, l.descricao, l.valor, i.nome AS imovel, c.categoria AS categoria
        FROM lancamentos l
        JOIN imoveis i ON i.id = l.id_imovel
        JOIN categorias c ON c.id = l.id_categoria
        WHERE l.id_situacao = 1
          AND l.data <= CURRENT_DATE
          AND l.id_categoria <> 0
        ORDER BY l.data DESC, l.id DESC
        LIMIT %s
        """,
        (limit,),
    )
    rows = cur.fetchall()
    conn.close()

    itens = []
    for r in rows:
        item = dict(r)
        d = item.get('data')
        if d:
            try:
                item['data'] = d.strftime('%d/%m/%Y')
            except Exception:
                s = str(d)
                if '-' in s:
                    partes = s.split('-')
                    if len(partes) == 3:
                        item['data'] = f"{partes[2]}/{partes[1]}/{partes[0]}"
                else:
                    item['data'] = s
        itens.append(item)
    return itens


def listar_totais_mensais_por_imovel(meses=6, categorias_excluidas=None, incluir_vendidos=True):
    """Retorna os totais desembolsados por mês (lancamentos confirmados), agrupados por imóvel."""

    try:
        meses = int(meses)
    except Exception:
        meses = 6
    meses = max(1, min(meses, 24))

    if categorias_excluidas is None:
        categorias_excluidas = [8, 15, 18]
    else:
        filtradas = []
        for item in categorias_excluidas:
            try:
                filtradas.append(int(item))
            except Exception:
                continue
        categorias_excluidas = filtradas

    intervalo = max(meses - 1, 0)

    conn, cur = conectar()
    try:
        base_sql = [
            "SELECT",
            "    DATE_TRUNC('month', l.data) AS mes,",
            "    i.id AS id_imovel,",
            "    i.nome AS nome_imovel,",
            "    SUM(l.valor) AS total",
            "FROM lancamentos l",
            "JOIN imoveis i ON i.id = l.id_imovel",
            "WHERE l.id_situacao = 1",
            "  AND (l.ativo IS DISTINCT FROM FALSE)",
        ]

        if not incluir_vendidos:
            base_sql.append("  AND (i.vendido IS DISTINCT FROM TRUE)")

        params = []

        if categorias_excluidas:
            base_sql.append("  AND (l.id_categoria IS NULL OR l.id_categoria NOT IN %s)")
            params.append(tuple(sorted(set(categorias_excluidas))))

        if intervalo > 0:
            base_sql.append(
                "  AND l.data >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' * %s"
            )
            params.append(intervalo)

        base_sql.append("GROUP BY mes, i.id, i.nome")
        base_sql.append("ORDER BY mes ASC, i.nome ASC")

        sql = "\n".join(base_sql)

        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        resultados = []
        for mes, id_imovel, nome_imovel, total in rows:
            try:
                mes_iso = mes.strftime('%Y-%m-01')
            except Exception:
                mes_iso = str(mes)
            resultados.append(
                {
                    "mes": mes_iso,
                    "id_imovel": id_imovel,
                    "nome_imovel": nome_imovel,
                    "total": float(total or 0),
                }
            )
        return resultados
    finally:
        conn.close()

# ======================================================
# 🔹 Resumo agregado dos imóveis
# ======================================================

def listar_resumo_imoveis(incluir_vendidos=True):
    conn, cur = conectar()
    where_clause = ""
    if not incluir_vendidos:
        where_clause = "WHERE i.vendido IS DISTINCT FROM TRUE"

    query = f"""
        WITH base AS (
            SELECT
                i.id AS id_imovel,
                COALESCE(o.id_grupo, 0) AS id_grupo,
                COALESCE(o.valor_efetivado, 0) AS valor_efetivado,
                COALESCE(o.valor_em_contratacao, 0) AS valor_em_contratacao,
                COALESCE(o.orcamento, 0) AS orcamento
            FROM vw_orcamento_execucao o
            JOIN imoveis i ON i.id = o.id_imovel
            {where_clause}
        ), per_imovel AS (
            SELECT
                id_imovel,
                SUM(CASE WHEN id_grupo NOT IN (6,7,8,9)
                    THEN GREATEST(orcamento, valor_efetivado + valor_em_contratacao)
                    ELSE 0 END) AS investimento_total,
                SUM(CASE WHEN id_grupo NOT IN (6,7,8,9)
                    THEN valor_efetivado ELSE 0 END) AS valor_efetivado,
                SUM(CASE WHEN id_grupo NOT IN (6,7,8,9)
                    THEN GREATEST(orcamento, valor_efetivado + valor_em_contratacao) - valor_efetivado
                    ELSE 0 END) AS saldo_a_investir,
                SUM(CASE WHEN id_grupo = 6
                    THEN GREATEST(orcamento, valor_efetivado + valor_em_contratacao)
                    ELSE 0 END) AS total_grupo6,
                SUM(CASE WHEN id_grupo = 7
                    THEN GREATEST(orcamento, valor_efetivado + valor_em_contratacao)
                    ELSE 0 END) AS total_grupo7,
                SUM(CASE WHEN id_grupo = 8
                    THEN GREATEST(orcamento, valor_efetivado + valor_em_contratacao)
                    ELSE 0 END) AS total_grupo8,
                SUM(CASE WHEN id_grupo = 9
                    THEN GREATEST(orcamento, valor_efetivado + valor_em_contratacao)
                    ELSE 0 END) AS total_grupo9
            FROM base
            GROUP BY id_imovel
        )
        SELECT
            COALESCE(SUM(valor_efetivado), 0) AS total_efetivado,
            COALESCE(SUM(saldo_a_investir), 0) AS total_a_investir,
            COALESCE(SUM(investimento_total), 0) AS investimento_total,
            COALESCE(SUM(
                (
                    total_grupo8 - (investimento_total + total_grupo6) - total_grupo7
                ) - GREATEST(
                    total_grupo9,
                    CASE
                        WHEN (total_grupo8 - (investimento_total + total_grupo6) - total_grupo7) > 0
                            THEN (total_grupo8 - (investimento_total + total_grupo6) - total_grupo7) * 0.15
                        ELSE 0
                    END
                )
            ), 0) AS lucro_projetado,
            COUNT(*) AS imoveis_considerados
        FROM per_imovel;
    """

    cur.execute(query)
    row = cur.fetchone()
    conn.close()

    if not row:
        total_efetivado = total_a_investir = lucro_projetado = investimento_total = 0.0
        imoveis_considerados = 0
    else:
        total_efetivado = float(row["total_efetivado"] or 0)
        total_a_investir = float(row["total_a_investir"] or 0)
        lucro_projetado = float(row["lucro_projetado"] or 0)
        investimento_total = float(row["investimento_total"] or 0)
        imoveis_considerados = int(row["imoveis_considerados"] or 0)

    return {
        "totais": {
            "total_efetivado": round(total_efetivado, 2),
            "total_a_investir": round(total_a_investir, 2),
            "lucro_projetado": round(lucro_projetado, 2),
            "investimento_total": round(investimento_total, 2),
            "imoveis_considerados": imoveis_considerados,
            "inclui_vendidos": incluir_vendidos,
        }
    }

# ======================================================
# 🔹 Funções para ORÇAMENTOS
# ======================================================

def listar_orcamentos_por_imovel(id_imovel):
    conn, cur = conectar()

    # Orçamentos já existentes para o imóvel
    cur.execute("""
        SELECT o.id_imovel, o.id_grupo, COALESCE(o.orcamento, 0) AS orcamento, g.grupo AS descricao
        FROM orcamentos o
        INNER JOIN grupos g ON o.id_grupo = g.id
        WHERE o.id_imovel = %s
    """, (id_imovel,))
    orcamentos = cur.fetchall()

    # Grupos que ainda não possuem orçamento para o imóvel
    cur.execute("""
        SELECT g.id, g.grupo 
        FROM grupos g
        WHERE g.id NOT IN (
            SELECT id_grupo FROM orcamentos WHERE id_imovel = %s
        )
    """, (id_imovel,))
    grupos_sem_orcamento = cur.fetchall()

    conn.close()

    # Adiciona grupos sem orçamento com valor zero
    lista_orcamentos = [
        {
            "id_imovel": id_imovel,
            "id_grupo": row[0],
            "orcamento": 0.0,
            "descricao": row[1]
        } for row in grupos_sem_orcamento
    ]

    # Adiciona os orçamentos existentes
    for row in orcamentos:
        lista_orcamentos.append({
            "id_imovel": row[0],
            "id_grupo": row[1],
            "orcamento": float(row[2]),
            "descricao": row[3]
        })

    return lista_orcamentos

def atualizar_inserir_orcamentos(id_imovel, orcamentos):
    conn, cur = conectar()

    for item in orcamentos:
        id_grupo = item.get("id_grupo")
        orcamento = item.get("orcamento", 0)

        # Tenta atualizar
        cur.execute("""
            UPDATE orcamentos
            SET orcamento = %s
            WHERE id_imovel = %s AND id_grupo = %s
        """, (orcamento, id_imovel, id_grupo))

        # Se não encontrou registro para update, faz insert
        if cur.rowcount == 0:
            cur.execute("""
                INSERT INTO orcamentos (id_imovel, id_grupo, orcamento)
                VALUES (%s, %s, %s)
            """, (id_imovel, id_grupo, orcamento))

    conn.commit()
    conn.close()

    return {"message": "Orçamentos atualizados com sucesso!"}



def alterar_lancamento(id_lancamento, dados):
    conn, cur = conectar()

    try:
        with conn.cursor() as cur:
            query = """
                UPDATE lancamentos
                SET
                    data = %s,
                    descricao = %s,
                    valor = %s,
                    id_categoria = %s,
                    id_imovel = %s,
                    id_situacao = %s
                WHERE id = %s
            """

            # Converte a data antes de salvar
            data_formatada = converter_data(dados['data'])

            cur.execute(query, (
                data_formatada,
                dados['descricao'],
                dados['valor'],
                dados['id_categoria'],
                dados['id_imovel'],
                dados['id_situacao'],
                id_lancamento
            ))

        conn.commit()
        print(f"Lançamento {id_lancamento} alterado com sucesso.")

    except Exception as e:
        conn.rollback()
        print(f"Erro ao alterar lançamento: {e}")
        raise e

    finally:
        conn.close()

def converter_data(data_str):
    """Converte datas de DD/MM/YYYY ou YYYY-MM-DD para YYYY-MM-DD.
    Lança exceção com mensagem clara se o formato for inválido."""
    try:
        # Tenta formato brasileiro
        if '/' in data_str:
            dia, mes, ano = data_str.split('/')
            return f"{ano}-{mes}-{dia}"
        # Tenta formato ISO já normalizado
        if '-' in data_str:
            partes = data_str.split('-')
            if len(partes) == 3 and len(partes[0]) == 4:
                return data_str
        raise ValueError(f"Formato de data inválido: {data_str}")
    except Exception:
        print(f"Erro ao converter data: {data_str}")
        raise
