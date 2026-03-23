from __future__ import annotations

import base64
import hashlib
import os
import secrets
import uuid
from collections import defaultdict
from functools import lru_cache
from datetime import datetime, timedelta, timezone
from db_connection import conectar
import json
from werkzeug.security import generate_password_hash


UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "static", "imoveis")
STATIC_URL_PREFIX = "/static/imoveis"


def _to_float(valor):
    try:
        return float(valor or 0)
    except (TypeError, ValueError):
        return 0.0


def _aliquota_ganho_capital(valor):
    taxa = _to_float(valor)
    if taxa < 0:
        return 0.0
    return taxa if taxa or valor == 0 else 0.15


def _total_estimado(item):
    if not item:
        return 0.0
    orcamento = _to_float(item.get("orcamento"))
    efetivado = _to_float(item.get("valor_efetivado"))
    em_contratacao = _to_float(item.get("valor_em_contratacao"))
    return max(orcamento, efetivado + em_contratacao)


def _metricas_por_imovel(registros, ganho_capital=None):
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
    aliquota_ganho_capital = _aliquota_ganho_capital(ganho_capital)
    ir_ganho_capital = max(
        total_grupo9,
        ganho_capital_base * aliquota_ganho_capital if ganho_capital_base > 0 else 0.0,
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


@lru_cache(maxsize=1)
def _garantir_tabela_usuarios():
    conn, cur = conectar()
    try:
        cur.execute(
            """
            SELECT to_regclass('public.users') AS tabela
            """
        )
        resultado = cur.fetchone()
        if resultado and resultado.get("tabela"):
            cur.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'users'
                  AND column_name IN (
                    'name',
                    'password_reset_required',
                    'invite_token_hash',
                    'invite_expires_at',
                    'invite_created_at'
                  )
                """
            )
            existing = {row[0] for row in cur.fetchall()}
            required = {
                "name",
                "password_reset_required",
                "invite_token_hash",
                "invite_expires_at",
                "invite_created_at",
            }
            # Em ambientes somente leitura, evita DDL quando a tabela já está no formato esperado.
            if required.issubset(existing):
                return
    finally:
        conn.close()

    conn, cur = conectar()
    try:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name TEXT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'viewer',
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                password_reset_required BOOLEAN NOT NULL DEFAULT FALSE,
                invite_token_hash TEXT,
                invite_expires_at TIMESTAMP WITH TIME ZONE,
                invite_created_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
            """
        )
        cur.execute(
            """
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS name TEXT
            """
        )
        cur.execute(
            """
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT FALSE
            """
        )
        cur.execute(
            """
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS invite_token_hash TEXT
            """
        )
        cur.execute(
            """
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMP WITH TIME ZONE
            """
        )
        cur.execute(
            """
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS invite_created_at TIMESTAMP WITH TIME ZONE
            """
        )
        cur.execute(
            """
            CREATE OR REPLACE FUNCTION set_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            """
        )
        cur.execute(
            """
            DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
            CREATE TRIGGER trg_users_updated_at
            BEFORE UPDATE ON users
            FOR EACH ROW
            EXECUTE FUNCTION set_updated_at();
            """
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def criar_usuario(
    email: str,
    senha: str,
    role: str = "viewer",
    is_active: bool = True,
    nome: str | None = None,
) -> dict:
    _garantir_tabela_usuarios()
    nome_norm = (nome or "").strip()
    if not nome_norm:
        raise ValueError("Nome obrigatório")
    email_norm = (email or "").strip().lower()
    if not email_norm:
        raise ValueError("E-mail obrigatório")
    role_norm = (role or "viewer").strip().lower()
    if role_norm not in {"viewer", "editor", "admin", "prospector"}:
        raise ValueError("Papel inválido")
    senha_hash = generate_password_hash(senha, method="pbkdf2:sha256", salt_length=16)

    conn, cur = conectar()
    try:
        cur.execute(
            """
            INSERT INTO users (name, email, password_hash, role, is_active)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, name, email, role, is_active, created_at, updated_at
            """,
            (nome_norm, email_norm, senha_hash, role_norm, is_active),
        )
        row = cur.fetchone()
        conn.commit()
        return dict(row)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _hash_invite_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@lru_cache(maxsize=1)
def _garantir_colunas_prospeccao_autoria():
    conn, cur = conectar()
    try:
        cur.execute(
            """
            ALTER TABLE imoveis_selecionados
            ADD COLUMN IF NOT EXISTS created_by INTEGER
            """
        )
        cur.execute(
            """
            ALTER TABLE imoveis_selecionados
            ADD COLUMN IF NOT EXISTS created_by_name TEXT
            """
        )
        cur.execute(
            """
            ALTER TABLE imoveis_selecionados
            ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE
            """
        )
        cur.execute(
            """
            ALTER TABLE imoveis_selecionados
            ADD COLUMN IF NOT EXISTS inativado_em TIMESTAMPTZ NULL
            """
        )
        cur.execute(
            """
            ALTER TABLE imoveis_selecionados
            ADD COLUMN IF NOT EXISTS inativado_por INTEGER NULL
            """
        )
        cur.execute(
            """
            ALTER TABLE imoveis_selecionados
            ADD COLUMN IF NOT EXISTS inativado_por_name TEXT NULL
            """
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _garantir_tabela_prospeccao_observacoes():
    conn, cur = conectar()
    try:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS imoveis_selecionados_observacoes (
                id BIGSERIAL PRIMARY KEY,
                numero_bem TEXT NOT NULL,
                observacao TEXT NOT NULL,
                created_by INTEGER NULL,
                created_by_name TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_imoveis_sel_obs_numero_bem_created_at
            ON imoveis_selecionados_observacoes (numero_bem, created_at DESC)
            """
        )
        cur.execute(
            """
            INSERT INTO imoveis_selecionados_observacoes (
                numero_bem, observacao, created_by, created_by_name, created_at
            )
            SELECT
                s.numero_bem,
                s.observacoes,
                s.created_by,
                s.created_by_name,
                COALESCE(s.updated_at, s.created_at, now())
            FROM imoveis_selecionados s
            WHERE s.observacoes IS NOT NULL
              AND BTRIM(s.observacoes) <> ''
              AND NOT EXISTS (
                  SELECT 1
                  FROM imoveis_selecionados_observacoes o
                  WHERE o.numero_bem = s.numero_bem
              )
            """
        )
        conn.commit()
    finally:
        conn.close()


def _garantir_tabela_prospeccao_analise():
    conn, cur = conectar()
    try:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS imoveis_selecionados_analise (
                numero_bem TEXT PRIMARY KEY REFERENCES imoveis_selecionados(numero_bem),
                link_google_maps TEXT NULL,
                valor_base_operacao NUMERIC NULL,
                tempo_operacao_meses INTEGER NOT NULL DEFAULT 12,
                valor_maximo_lance NUMERIC NULL,
                percentual_financiamento NUMERIC NULL,
                prestacao_mensal_financiamento NUMERIC NULL,
                valor_estimado_venda NUMERIC NULL,
                reforma NUMERIC NULL,
                condominio_atraso NUMERIC NULL,
                iptu_atraso NUMERIC NULL,
                desocupacao NUMERIC NULL,
                itbi_percentual NUMERIC NULL,
                itbi_valor NUMERIC NULL,
                documentacao NUMERIC NULL,
                manutencao_agua_mensal NUMERIC NULL,
                manutencao_luz_mensal NUMERIC NULL,
                manutencao_condominio_mensal NUMERIC NULL,
                manutencao_iptu_mensal NUMERIC NULL,
                comissao_leiloeiro_percentual NUMERIC NULL,
                comissao_leiloeiro_valor NUMERIC NULL,
                comissao_corretor_percentual NUMERIC NULL,
                comissao_corretor_valor NUMERIC NULL,
                ganho_capital_percentual NUMERIC NULL,
                ganho_capital_valor NUMERIC NULL,
                created_by INTEGER NULL,
                created_by_name TEXT NULL,
                updated_by INTEGER NULL,
                updated_by_name TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        cur.execute(
            """
            ALTER TABLE imoveis_selecionados_analise
            ADD COLUMN IF NOT EXISTS prestacao_mensal_financiamento NUMERIC NULL
            """
        )
        conn.commit()
    finally:
        conn.close()


def _garantir_tabela_prospeccao_responsaveis():
    conn, cur = conectar()
    try:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS imoveis_selecionados_responsaveis (
                numero_bem TEXT NOT NULL REFERENCES imoveis_selecionados(numero_bem) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                assigned_by INTEGER NULL,
                assigned_by_name TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (numero_bem, user_id)
            )
            """
        )
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_imoveis_sel_resp_numero_bem
            ON imoveis_selecionados_responsaveis (numero_bem, created_at DESC)
            """
        )
        conn.commit()
    finally:
        conn.close()


def listar_usuarios() -> list[dict]:
    _garantir_tabela_usuarios()
    conn, cur = conectar()
    try:
        cur.execute(
            """
            SELECT
                id,
                name,
                email,
                role,
                is_active,
                created_at,
                updated_at,
                password_reset_required,
                invite_expires_at,
                (invite_token_hash IS NOT NULL) AS invite_pending
            FROM users
            ORDER BY created_at DESC
            """
        )
        rows = cur.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def criar_convite_usuario(
    nome: str,
    email: str,
    role: str = "viewer",
    is_active: bool = True,
    invite_hours: int = 72,
) -> dict:
    _garantir_tabela_usuarios()

    nome_norm = (nome or "").strip()
    if not nome_norm:
        raise ValueError("Nome obrigatório")
    email_norm = (email or "").strip().lower()
    if not email_norm:
        raise ValueError("E-mail obrigatório")
    role_norm = (role or "viewer").strip().lower()
    if role_norm not in {"viewer", "editor", "admin", "prospector"}:
        raise ValueError("Papel inválido")

    invite_hours = max(1, int(invite_hours or 72))
    invite_token = secrets.token_urlsafe(24)
    invite_token_hash = _hash_invite_token(invite_token)
    invite_expires_at = datetime.now(timezone.utc) + timedelta(hours=invite_hours)

    conn, cur = conectar()
    try:
        cur.execute(
            "SELECT id FROM users WHERE email = %s LIMIT 1",
            (email_norm,),
        )
        existing = cur.fetchone()

        if existing:
            cur.execute(
                """
                UPDATE users
                SET
                    name = %s,
                    role = %s,
                    is_active = %s,
                    invite_token_hash = %s,
                    invite_expires_at = %s,
                    invite_created_at = NOW(),
                    password_reset_required = TRUE,
                    updated_at = NOW()
                WHERE email = %s
                RETURNING id, name, email, role, is_active, invite_expires_at
                """,
                (nome_norm, role_norm, is_active, invite_token_hash, invite_expires_at, email_norm),
            )
        else:
            placeholder_hash = generate_password_hash(
                secrets.token_urlsafe(32),
                method="pbkdf2:sha256",
                salt_length=16,
            )
            cur.execute(
                """
                INSERT INTO users (
                    name,
                    email,
                    password_hash,
                    role,
                    is_active,
                    invite_token_hash,
                    invite_expires_at,
                    invite_created_at,
                    password_reset_required
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), TRUE)
                RETURNING id, name, email, role, is_active, invite_expires_at
                """,
                (
                    nome_norm,
                    email_norm,
                    placeholder_hash,
                    role_norm,
                    is_active,
                    invite_token_hash,
                    invite_expires_at,
                ),
            )

        user = cur.fetchone()
        conn.commit()
        result = dict(user)
        result["invite_token"] = invite_token
        return result
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def definir_senha_por_convite(email: str, token: str, nova_senha: str) -> dict:
    _garantir_tabela_usuarios()

    email_norm = (email or "").strip().lower()
    if not email_norm:
        raise ValueError("E-mail obrigatório")
    if not token:
        raise ValueError("Token obrigatório")
    if not nova_senha or len(nova_senha) < 8:
        raise ValueError("Senha deve ter pelo menos 8 caracteres")

    token_hash = _hash_invite_token(token)
    conn, cur = conectar()
    try:
        cur.execute(
            """
            SELECT id, name, email, role, invite_token_hash, invite_expires_at
            FROM users
            WHERE email = %s
            LIMIT 1
            """,
            (email_norm,),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError("Convite inválido")
        if not row["invite_token_hash"] or row["invite_token_hash"] != token_hash:
            raise ValueError("Convite inválido")
        if row["invite_expires_at"] and row["invite_expires_at"] < datetime.now(timezone.utc):
            raise ValueError("Convite expirado")

        new_hash = generate_password_hash(nova_senha, method="pbkdf2:sha256", salt_length=16)
        cur.execute(
            """
            UPDATE users
            SET
                password_hash = %s,
                password_reset_required = FALSE,
                invite_token_hash = NULL,
                invite_expires_at = NULL,
                invite_created_at = NULL,
                is_active = TRUE,
                updated_at = NOW()
            WHERE id = %s
            RETURNING id, name, email, role, is_active
            """,
            (new_hash, row["id"]),
        )
        user = cur.fetchone()
        conn.commit()
        return dict(user)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def obter_usuario_por_email(email: str) -> dict | None:
    _garantir_tabela_usuarios()
    email_norm = (email or "").strip().lower()
    if not email_norm:
        return None

    conn, cur = conectar()
    try:
        cur.execute(
            """
            SELECT id, name, email, password_hash, role, is_active, password_reset_required
            FROM users
            WHERE email = %s
            LIMIT 1
            """,
            (email_norm,),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def obter_usuario_por_id(user_id: int) -> dict | None:
    _garantir_tabela_usuarios()
    conn, cur = conectar()
    try:
        cur.execute(
            """
            SELECT id, name, email, role, is_active
            FROM users
            WHERE id = %s
            """,
            (user_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def atualizar_status_usuario(user_id: int, is_active: bool) -> None:
    _garantir_tabela_usuarios()
    conn, cur = conectar()
    try:
        cur.execute(
            """
            UPDATE users
            SET is_active = %s
            WHERE id = %s
            """,
            (is_active, user_id),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def atualizar_usuario(user_id: int, nome: str, is_active: bool) -> dict | None:
    _garantir_tabela_usuarios()
    nome_norm = (nome or "").strip()
    if not nome_norm:
        raise ValueError("Nome obrigatório")

    conn, cur = conectar()
    try:
        cur.execute(
            """
            UPDATE users
            SET
                name = %s,
                is_active = %s,
                updated_at = NOW()
            WHERE id = %s
            RETURNING id, name, email, role, is_active, created_at, updated_at,
                      password_reset_required, invite_expires_at,
                      (invite_token_hash IS NOT NULL) AS invite_pending
            """,
            (nome_norm, is_active, user_id),
        )
        row = cur.fetchone()
        conn.commit()
        return dict(row) if row else None
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


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

            metricas = _metricas_por_imovel(
                registros_por_imovel.get(item["id"], []),
                item.get("ganho_capital"),
            )
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

def _normalizar_paginacao(limit, page, limit_padrao=50, limit_maximo=200):
    try:
        limit_val = int(limit)
    except (TypeError, ValueError):
        limit_val = limit_padrao
    limit_val = max(1, min(limit_maximo, limit_val))

    try:
        page_val = int(page)
    except (TypeError, ValueError):
        page_val = 1
    page_val = max(1, page_val)

    offset_val = (page_val - 1) * limit_val
    return limit_val, page_val, offset_val


def listar_lancamentos_completos_view(id_imovel, *, limit=50, page=1):
    limit_val, page_val, offset_val = _normalizar_paginacao(limit, page)

    conn, cur = conectar()
    try:
        cur.execute(
            """
            SELECT
                id_lancamento,
                data,
                descricao,
                valor,
                id_imovel,
                id_categoria,
                id_situacao,
                nome_imovel,
                nome_categoria,
                nome_situacao,
                COUNT(*) OVER () AS total_registros
            FROM vw_lancamentos_completos
            WHERE id_imovel = %s
            ORDER BY data DESC, id_lancamento DESC
            LIMIT %s OFFSET %s
            """,
            (id_imovel, limit_val, offset_val),
        )
        rows = cur.fetchall()

        cur.execute(
            """
            SELECT
                COUNT(*) AS total_registros,
                COALESCE(SUM(valor), 0) AS soma_valores,
                COUNT(DISTINCT nome_categoria) AS categorias_distintas
            FROM vw_lancamentos_completos
            WHERE id_imovel = %s
            """,
            (id_imovel,),
        )
        resumo = cur.fetchone() or {}
    finally:
        conn.close()

    total_registros = int(rows[0]["total_registros"]) if rows else int(resumo.get("total_registros") or 0)

    itens = []
    for row in rows:
        linha = dict(row)
        data_obj = linha.get("data")
        if data_obj:
            linha["data"] = data_obj.strftime("%d/%m/%Y")
        linha.pop("total_registros", None)
        itens.append(linha)

    return {
        "items": itens,
        "total": total_registros,
        "summary": {
            "total": int(resumo.get("total_registros") or 0),
            "soma": float(resumo.get("soma_valores") or 0),
            "categorias": int(resumo.get("categorias_distintas") or 0),
        },
        "page": page_val,
        "pageSize": limit_val,
    }


def listar_lancamentos_incompletos_view(id_imovel=None, *, limit=50, page=1):
    limit_val, page_val, offset_val = _normalizar_paginacao(limit, page)

    conn, cur = conectar()
    try:
        base_params = []
        filtros = []
        if id_imovel is not None:
            filtros.append("v.id_imovel = %s")
            base_params.append(id_imovel)

        where_clause = ""
        if filtros:
            where_clause = "WHERE " + " AND ".join(filtros)

        cur.execute(
            f"""
            SELECT
                v.id_lancamento,
                v.data,
                v.descricao,
                v.valor,
                v.id_imovel,
                v.id_categoria,
                v.id_situacao,
                v.nome_imovel,
                COALESCE(c.categoria, 'Sem categoria') AS nome_categoria,
                v.nome_situacao,
                COUNT(*) OVER () AS total_registros
            FROM vw_lancamentos_incompletos v
            LEFT JOIN categorias c ON c.id = v.id_categoria
            {where_clause}
            ORDER BY v.data DESC, v.id_lancamento DESC
            LIMIT %s OFFSET %s
            """,
            (*base_params, limit_val, offset_val),
        )
        rows = cur.fetchall()

        cur.execute(
            f"""
            SELECT
                COUNT(*) AS total_registros,
                COALESCE(SUM(v.valor), 0) AS soma_valores
            FROM vw_lancamentos_incompletos v
            {where_clause}
            """,
            tuple(base_params),
        )
        resumo = cur.fetchone() or {}
    finally:
        conn.close()

    total_registros = int(rows[0]["total_registros"]) if rows else int(resumo.get("total_registros") or 0)

    itens = []
    for row in rows:
        linha = dict(row)
        data_obj = linha.get("data")
        if data_obj:
            linha["data"] = data_obj.strftime("%d/%m/%Y")
        linha.pop("total_registros", None)
        itens.append(linha)

    return {
        "items": itens,
        "total": total_registros,
        "summary": {
            "total": int(resumo.get("total_registros") or 0),
            "soma": float(resumo.get("soma_valores") or 0),
        },
        "page": page_val,
        "pageSize": limit_val,
    }

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


def listar_detalhes_gastos_mensais(id_imovel, mes, categorias_excluidas=None):
    if not id_imovel:
        raise ValueError("ID do imóvel é obrigatório")
    if not mes:
        raise ValueError("Parâmetro 'mes' é obrigatório no formato AAAA-MM")

    mes = str(mes).strip()
    if len(mes) >= 10:
        mes = mes[:7]

    try:
        inicio = datetime.strptime(mes, "%Y-%m").replace(day=1)
    except ValueError as exc:
        raise ValueError("Formato de mês inválido. Use AAAA-MM") from exc

    if inicio.month == 12:
        fim = inicio.replace(year=inicio.year + 1, month=1)
    else:
        fim = inicio.replace(month=inicio.month + 1)

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

    conn, cur = conectar()
    try:
        cur.execute(
            "SELECT nome FROM imoveis WHERE id = %s",
            (id_imovel,),
        )
        row_imovel = cur.fetchone()
        if not row_imovel:
            raise ValueError("Imóvel não encontrado")
        nome_imovel = row_imovel[0]

        params = [id_imovel, inicio.date(), fim.date()]
        filtros_categoria = ""
        if categorias_excluidas:
            filtros_categoria = " AND (l.id_categoria IS NULL OR l.id_categoria NOT IN %s)"
            params.append(tuple(sorted(set(categorias_excluidas))))

        cur.execute(
            f"""
            SELECT
                g.id AS id_grupo,
                COALESCE(g.grupo, 'Sem grupo') AS nome_grupo,
                c.id AS id_categoria,
                COALESCE(c.categoria, 'Sem categoria') AS nome_categoria,
                SUM(l.valor) AS total
            FROM lancamentos l
            LEFT JOIN categorias c ON c.id = l.id_categoria
            LEFT JOIN grupos g ON g.id = c.id_grupo
            WHERE l.id_imovel = %s
              AND l.id_situacao = 1
              AND (l.ativo IS DISTINCT FROM FALSE)
              AND l.data >= %s AND l.data < %s
              {filtros_categoria}
            GROUP BY g.id, nome_grupo, c.id, nome_categoria
            ORDER BY nome_grupo ASC, nome_categoria ASC
            """,
            tuple(params),
        )
        rows = cur.fetchall()
    finally:
        conn.close()

    grupos = {}
    total_geral = 0.0

    for row in rows:
        id_grupo = row["id_grupo"] if isinstance(row, dict) else row[0]
        nome_grupo = row["nome_grupo"] if isinstance(row, dict) else row[1]
        id_categoria = row["id_categoria"] if isinstance(row, dict) else row[2]
        nome_categoria = row["nome_categoria"] if isinstance(row, dict) else row[3]
        total_cat = float(row["total"] if isinstance(row, dict) else row[4] or 0)

        chave_grupo = id_grupo if id_grupo is not None else 0
        if chave_grupo not in grupos:
            grupos[chave_grupo] = {
                "id_grupo": id_grupo,
                "grupo": nome_grupo,
                "total_grupo": 0.0,
                "categorias": [],
            }

        grupos[chave_grupo]["categorias"].append(
            {
                "id_categoria": id_categoria,
                "categoria": nome_categoria,
                "total": total_cat,
            }
        )
        grupos[chave_grupo]["total_grupo"] += total_cat
        total_geral += total_cat

    detalhes = sorted(grupos.values(), key=lambda item: (-item["total_grupo"], item["grupo"]))
    for grupo in detalhes:
        grupo["categorias"] = sorted(
            grupo["categorias"],
            key=lambda item: (-item["total"], item["categoria"]),
        )

    return {
        "mes": inicio.strftime("%Y-%m-01"),
        "imovel": {
            "id": id_imovel,
            "nome": nome_imovel,
        },
        "total": total_geral,
        "grupos": detalhes,
    }


def listar_transacoes_mensais(id_imovel, mes, categoria_id=None):
    if not id_imovel:
        raise ValueError("ID do imóvel é obrigatório")
    if not mes:
        raise ValueError("Parâmetro 'mes' é obrigatório no formato AAAA-MM")

    mes = str(mes).strip()
    if len(mes) >= 10:
        mes = mes[:7]

    try:
        inicio = datetime.strptime(mes, "%Y-%m").replace(day=1)
    except ValueError as exc:
        raise ValueError("Formato de mês inválido. Use AAAA-MM") from exc

    if inicio.month == 12:
        fim = inicio.replace(year=inicio.year + 1, month=1)
    else:
        fim = inicio.replace(month=inicio.month + 1)

    conn, cur = conectar()
    try:
        params = [id_imovel, inicio.date(), fim.date()]
        filtro_categoria = ""
        if categoria_id is not None:
            filtro_categoria = " AND c.id = %s"
            params.append(int(categoria_id))

        cur.execute(
            f"""
            SELECT
                l.id,
                l.data,
                l.descricao,
                l.valor,
                c.id AS id_categoria,
                COALESCE(c.categoria, 'Sem categoria') AS categoria,
                g.id AS id_grupo,
                COALESCE(g.grupo, 'Sem grupo') AS grupo
            FROM lancamentos l
            LEFT JOIN categorias c ON c.id = l.id_categoria
            LEFT JOIN grupos g ON g.id = c.id_grupo
            WHERE l.id_imovel = %s
              AND l.id_situacao = 1
              AND (l.ativo IS DISTINCT FROM FALSE)
              AND l.data >= %s AND l.data < %s
              {filtro_categoria}
            ORDER BY l.data DESC, l.id DESC
            """,
            tuple(params),
        )
        rows = cur.fetchall()
    finally:
        conn.close()

    transacoes = []
    for row in rows:
        data_valor = row["data"]
        if hasattr(data_valor, "strftime"):
            data_formatada = data_valor.strftime("%d/%m/%Y")
        else:
            data_formatada = str(data_valor)

        transacoes.append(
            {
                "id": row["id"],
                "data": data_formatada,
                "descricao": row["descricao"],
                "valor": float(row["valor"] or 0),
                "id_categoria": row["id_categoria"],
                "categoria": row["categoria"],
                "id_grupo": row["id_grupo"],
                "grupo": row["grupo"],
            }
        )

    return transacoes

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
                COALESCE(i.ganho_capital, 0.15) AS ganho_capital,
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
                MAX(ganho_capital) AS ganho_capital,
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
                            THEN (total_grupo8 - (investimento_total + total_grupo6) - total_grupo7) * ganho_capital
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


# ======================================================
# 🔹 PROSPECÇÕES (Supabase)
# ======================================================


def listar_prospeccoes_capturados(limit=50, offset=0, ufs=None, modalidades=None, status=None, financia=None, cidades=None, order_by="coletado_em", order_dir="desc"):
    conn, cur = conectar()
    base_cte = """
        WITH base AS (
            SELECT
                numero_bem,
                coletado_em,
                tipo_venda,
                tipo_imovel,
                uf,
                cidade,
                bairro,
                endereco,
                valor_venda,
                valor_avaliacao,
                desconto,
                detalhes,
                disponivel,
                financia,
                valor_leilao_1,
                valor_leilao_2,
                data_leilao_1,
                data_leilao_2,
                data_licitacao_aberta,
                data_hora_encerramento,
                lance_atual,
                link_consulta,
                fonte,
                (
                    SELECT MIN(v)
                    FROM (VALUES (valor_leilao_1), (valor_leilao_2), (valor_venda)) AS vals(v)
                    WHERE v IS NOT NULL
                ) AS valor_minimo,
                (
                    SELECT MAX(d)
                    FROM (
                        VALUES (data_leilao_1),
                               (data_leilao_2),
                               (data_licitacao_aberta),
                               (data_hora_encerramento),
                               (coletado_em)
                    ) AS datas(d)
                    WHERE d IS NOT NULL
                ) AS ultima_disputa
            FROM vw_imoveis_prospeccao_latest
        )
    """
    conditions = []
    params = []

    if ufs:
        placeholders = ",".join(["LOWER(%s)"] * len(ufs))
        conditions.append(f"LOWER(uf) IN ({placeholders})")
        params.extend([item.lower() for item in ufs])
    if modalidades:
        placeholders = ",".join(["LOWER(%s)"] * len(modalidades))
        conditions.append(f"LOWER(tipo_venda) IN ({placeholders})")
        params.extend([item.lower() for item in modalidades])
    status_list = status or ["disponivel"]
    if status_list:
        values = []
        for s in status_list:
            if isinstance(s, str) and s.lower() == "disponivel":
                values.append(True)
            elif isinstance(s, str) and s.lower() == "indisponivel":
                values.append(False)
        if values:
            placeholders = ",".join(["%s"] * len(values))
            conditions.append(f"disponivel IN ({placeholders})")
            params.extend(values)
    if financia:
        values = []
        for f in financia:
            if isinstance(f, str) and f.lower() in {"sim", "true", "1"}:
                values.append(True)
            elif isinstance(f, str) and f.lower() in {"nao", "não", "false", "0"}:
                values.append(False)
        if values:
            placeholders = ",".join(["%s"] * len(values))
            conditions.append(f"financia IN ({placeholders})")
            params.extend(values)
    if cidades:
        placeholders = ",".join(["LOWER(%s)"] * len(cidades))
        conditions.append(f"LOWER(cidade) IN ({placeholders})")
        params.extend([item.lower() for item in cidades])

    where_clause = ""
    if conditions:
        where_clause = " WHERE " + " AND ".join(conditions)

    order_map = {
        "codigo": "numero_bem",
        "cidade": "cidade",
        "uf": "uf",
        "modalidade": "tipo_venda",
        "valor": "valor_minimo",
        "valor_minimo": "valor_minimo",
        "ultima_disputa": "ultima_disputa",
        "coletado_em": "coletado_em",
    }
    order_col = order_map.get(order_by, "coletado_em")
    direction = "ASC" if (order_dir or "").lower() == "asc" else "DESC"

    count_query = f"""{base_cte} SELECT COUNT(*) FROM base {where_clause}"""
    cur.execute(count_query, params)
    total = cur.fetchone()[0]

    data_query = (
        f"""{base_cte} SELECT * FROM base{where_clause} """
        f"""ORDER BY {order_col} {direction} LIMIT %s OFFSET %s"""
    )
    query_params = params + [limit, offset]

    cur.execute(data_query, query_params)
    rows = cur.fetchall()
    conn.close()

    result = []
    for row in rows:
        valor_minimo = float(row["valor_minimo"]) if row["valor_minimo"] is not None else None
        ultima_disputa = row["ultima_disputa"].isoformat() if row["ultima_disputa"] is not None else None
        result.append({
            "numero_bem": row["numero_bem"],
            "coletado_em": row["coletado_em"].isoformat() if row["coletado_em"] else None,
            "tipo_venda": row["tipo_venda"],
            "tipo_imovel": row["tipo_imovel"],
            "uf": row["uf"],
            "cidade": row["cidade"],
            "bairro": row["bairro"],
            "endereco": row["endereco"],
            "valor_venda": float(row["valor_venda"]) if row["valor_venda"] is not None else None,
            "valor_avaliacao": float(row["valor_avaliacao"]) if row["valor_avaliacao"] is not None else None,
            "desconto": float(row["desconto"]) if row["desconto"] is not None else None,
            "detalhes": row["detalhes"],
            "disponivel": row["disponivel"],
            "financia": row["financia"],
            "valor_leilao_1": float(row["valor_leilao_1"]) if row["valor_leilao_1"] is not None else None,
            "valor_leilao_2": float(row["valor_leilao_2"]) if row["valor_leilao_2"] is not None else None,
            "data_leilao_1": row["data_leilao_1"].isoformat() if row["data_leilao_1"] else None,
            "data_leilao_2": row["data_leilao_2"].isoformat() if row["data_leilao_2"] else None,
            "data_licitacao_aberta": row["data_licitacao_aberta"].isoformat() if row["data_licitacao_aberta"] else None,
            "data_hora_encerramento": row["data_hora_encerramento"].isoformat() if row["data_hora_encerramento"] else None,
            "lance_atual": float(row["lance_atual"]) if row["lance_atual"] is not None else None,
            "link_consulta": row["link_consulta"],
            "fonte": row["fonte"],
            "valor_minimo": valor_minimo,
            "ultima_disputa": ultima_disputa,
        })
    return {"total": total, "data": result}


def listar_prospeccoes_selecionados(
    status=None,
    uf=None,
    viewer_user_id=None,
    viewer_role=None,
    related_user_id=None,
):
    _garantir_colunas_prospeccao_autoria()
    _garantir_tabela_prospeccao_observacoes()
    _garantir_tabela_prospeccao_analise()
    _garantir_tabela_prospeccao_responsaveis()
    conn, cur = conectar()
    base_query = """
        SELECT
            s.numero_bem,
            s.status,
            s.valor_maximo,
            s.prioridade,
            s.observacoes,
            s.created_by,
            COALESCE(NULLIF(u.name, ''), NULLIF(s.created_by_name, ''), u.email) AS created_by_name,
            v.cidade,
            v.uf,
            v.valor_venda,
            v.valor_avaliacao,
            v.link_consulta,
            v.tipo_venda,
            v.disponivel,
            v.detalhes,
            a.numero_bem AS analise_numero_bem,
            a.valor_base_operacao,
            a.tempo_operacao_meses,
            a.valor_maximo_lance,
            a.percentual_financiamento,
            a.prestacao_mensal_financiamento,
            a.valor_estimado_venda,
            a.reforma,
            a.condominio_atraso,
            a.iptu_atraso,
            a.desocupacao,
            a.itbi_percentual,
            a.itbi_valor,
            a.documentacao,
            a.manutencao_agua_mensal,
            a.manutencao_luz_mensal,
            a.manutencao_condominio_mensal,
            a.manutencao_iptu_mensal,
            a.comissao_leiloeiro_percentual,
            a.comissao_leiloeiro_valor,
            a.comissao_corretor_percentual,
            a.comissao_corretor_valor,
            a.ganho_capital_percentual,
            a.ganho_capital_valor,
            (
                SELECT MAX(d)
                FROM (
                    VALUES (v.data_leilao_1),
                           (v.data_leilao_2),
                           (v.data_hora_encerramento)
                ) AS datas(d)
                WHERE d IS NOT NULL
            ) AS data_leilao
        FROM imoveis_selecionados s
        LEFT JOIN users u
            ON u.id = s.created_by
        LEFT JOIN imoveis_selecionados_analise a
            ON a.numero_bem = s.numero_bem
        LEFT JOIN vw_imoveis_prospeccao_latest v
            ON v.numero_bem = s.numero_bem
    """
    conditions = []
    params = []

    conditions.append("COALESCE(s.ativo, TRUE) = TRUE")

    if status:
        conditions.append("LOWER(s.status) = LOWER(%s)")
        params.append(status)
    if uf:
        conditions.append("LOWER(v.uf) = LOWER(%s)")
        params.append(uf)
    if viewer_role != "admin":
        if viewer_user_id is None:
            conn.close()
            return []
        conditions.append(
            """
            (
                s.created_by = %s
                OR EXISTS (
                    SELECT 1
                    FROM imoveis_selecionados_responsaveis r_view
                    WHERE r_view.numero_bem = s.numero_bem
                      AND r_view.user_id = %s
                )
            )
            """
        )
        params.extend([viewer_user_id, viewer_user_id])
    elif related_user_id is not None:
        conditions.append(
            """
            (
                s.created_by = %s
                OR EXISTS (
                    SELECT 1
                    FROM imoveis_selecionados_responsaveis r_related
                    WHERE r_related.numero_bem = s.numero_bem
                      AND r_related.user_id = %s
                )
            )
            """
        )
        params.extend([related_user_id, related_user_id])

    if conditions:
        base_query += " WHERE " + " AND ".join(conditions)

    base_query += " ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST"

    cur.execute(base_query, params)
    rows = cur.fetchall()

    numeros_bem = [row[0] for row in rows if row[0]]
    historico_por_imovel = {}
    responsaveis_por_imovel = {}
    if numeros_bem:
        cur.execute(
            """
            SELECT
                o.numero_bem,
                o.observacao,
                o.created_by,
                COALESCE(NULLIF(u.name, ''), NULLIF(o.created_by_name, ''), u.email) AS created_by_name,
                o.created_at
            FROM imoveis_selecionados_observacoes
            o
            LEFT JOIN users u
                ON u.id = o.created_by
            WHERE numero_bem = ANY(%s)
            ORDER BY created_at DESC
            """,
            (numeros_bem,),
        )
        for numero_bem, observacao, created_by, created_by_name, created_at in cur.fetchall():
            historico_por_imovel.setdefault(numero_bem, []).append({
                "observacao": observacao,
                "created_by": created_by,
                "created_by_name": created_by_name,
                "created_at": created_at.isoformat() if created_at else None,
            })
        cur.execute(
            """
            SELECT
                r.numero_bem,
                r.user_id,
                COALESCE(NULLIF(u.name, ''), u.email) AS user_name,
                u.email,
                u.role
            FROM imoveis_selecionados_responsaveis r
            JOIN users u
              ON u.id = r.user_id
            WHERE r.numero_bem = ANY(%s)
              AND COALESCE(u.is_active, TRUE) = TRUE
            ORDER BY COALESCE(NULLIF(u.name, ''), u.email), u.email
            """,
            (numeros_bem,),
        )
        for numero_bem, user_id, user_name, email, role in cur.fetchall():
            responsaveis_por_imovel.setdefault(numero_bem, []).append({
                "id": user_id,
                "name": user_name,
                "email": email,
                "role": role,
            })
    conn.close()

    result = []
    for row in rows:
        tem_analise = row["analise_numero_bem"] is not None
        analise_inputs = {
            "valor_base_operacao": float(row["valor_base_operacao"]) if row["valor_base_operacao"] is not None else None,
            "tempo_operacao_meses": row["tempo_operacao_meses"],
            "valor_maximo_lance": float(row["valor_maximo_lance"]) if row["valor_maximo_lance"] is not None else (float(row["valor_maximo"]) if row["valor_maximo"] is not None else 0.0),
            "percentual_financiamento": float(row["percentual_financiamento"]) if row["percentual_financiamento"] is not None else None,
            "prestacao_mensal_financiamento": float(row["prestacao_mensal_financiamento"]) if row["prestacao_mensal_financiamento"] is not None else None,
            "valor_estimado_venda": float(row["valor_estimado_venda"]) if row["valor_estimado_venda"] is not None else None,
            "reforma": float(row["reforma"]) if row["reforma"] is not None else None,
            "condominio_atraso": float(row["condominio_atraso"]) if row["condominio_atraso"] is not None else None,
            "iptu_atraso": float(row["iptu_atraso"]) if row["iptu_atraso"] is not None else None,
            "desocupacao": float(row["desocupacao"]) if row["desocupacao"] is not None else None,
            "itbi_percentual": float(row["itbi_percentual"]) if row["itbi_percentual"] is not None else None,
            "itbi_valor": float(row["itbi_valor"]) if row["itbi_valor"] is not None else None,
            "documentacao": float(row["documentacao"]) if row["documentacao"] is not None else None,
            "manutencao_agua_mensal": float(row["manutencao_agua_mensal"]) if row["manutencao_agua_mensal"] is not None else None,
            "manutencao_luz_mensal": float(row["manutencao_luz_mensal"]) if row["manutencao_luz_mensal"] is not None else None,
            "manutencao_condominio_mensal": float(row["manutencao_condominio_mensal"]) if row["manutencao_condominio_mensal"] is not None else None,
            "manutencao_iptu_mensal": float(row["manutencao_iptu_mensal"]) if row["manutencao_iptu_mensal"] is not None else None,
            "comissao_leiloeiro_percentual": float(row["comissao_leiloeiro_percentual"]) if row["comissao_leiloeiro_percentual"] is not None else None,
            "comissao_leiloeiro_valor": float(row["comissao_leiloeiro_valor"]) if row["comissao_leiloeiro_valor"] is not None else None,
            "comissao_corretor_percentual": float(row["comissao_corretor_percentual"]) if row["comissao_corretor_percentual"] is not None else None,
            "comissao_corretor_valor": float(row["comissao_corretor_valor"]) if row["comissao_corretor_valor"] is not None else None,
            "ganho_capital_percentual": float(row["ganho_capital_percentual"]) if row["ganho_capital_percentual"] is not None else None,
            "ganho_capital_valor": float(row["ganho_capital_valor"]) if row["ganho_capital_valor"] is not None else None,
        }
        calculos_analise = calcular_analise_prospeccao(analise_inputs) if tem_analise else None

        result.append({
            "numero_bem": row["numero_bem"],
            "status": row["status"],
            "valor_maximo": float(row["valor_maximo"]) if row["valor_maximo"] is not None else None,
            "prioridade": row["prioridade"],
            "observacoes": row["observacoes"],
            "observacoes_historico": historico_por_imovel.get(row["numero_bem"], []),
            "created_by": row["created_by"],
            "created_by_name": row["created_by_name"],
            "responsaveis": responsaveis_por_imovel.get(row["numero_bem"], []),
            "cidade": row["cidade"],
            "uf": row["uf"],
            "valor_venda": float(row["valor_venda"]) if row["valor_venda"] is not None else None,
            "valor_avaliacao": float(row["valor_avaliacao"]) if row["valor_avaliacao"] is not None else None,
            "link_consulta": row["link_consulta"],
            "tipo_venda": row["tipo_venda"],
            "disponivel": row["disponivel"],
            "detalhes": row["detalhes"],
            "data_leilao": row["data_leilao"].isoformat() if row["data_leilao"] else None,
            "analise_salva": tem_analise,
            "roi_esperado_percentual": calculos_analise["roi_esperado_percentual"] if calculos_analise else None,
            "lucro_esperado_valor": calculos_analise["lucro_esperado_valor"] if calculos_analise else None,
        })
    return result


def _round_money(value):
    return round(_to_float(value), 2)


def _round_percent(value):
    return round(_to_float(value), 4)


def _coerce_nullable_money(value):
    if value in (None, ""):
        return None
    return _round_money(value)


def _coerce_nullable_percent(value):
    if value in (None, ""):
        return None
    return _round_percent(value)


def _coerce_tempo_operacao(value):
    try:
        inteiro = int(value)
    except (TypeError, ValueError):
        return 12
    return max(1, inteiro)


def _resolver_percentual_valor(base, percentual, valor):
    base_val = _to_float(base)
    percentual_val = _coerce_nullable_percent(percentual)
    valor_val = _coerce_nullable_money(valor)

    if valor_val is None and percentual_val is None:
        return 0.0, 0.0

    if valor_val is not None:
        percentual_calc = ((valor_val / base_val) * 100) if base_val > 0 else 0.0
        return _round_percent(percentual_calc), _round_money(valor_val)

    valor_calc = base_val * ((_to_float(percentual_val)) / 100)
    return _round_percent(percentual_val), _round_money(valor_calc)


def calcular_analise_prospeccao(dados):
    valor_maximo_lance = _round_money(dados.get("valor_maximo_lance"))
    valor_base_operacao = _coerce_nullable_money(dados.get("valor_base_operacao"))
    if valor_base_operacao is None:
        valor_base_operacao = valor_maximo_lance

    tempo_operacao_meses = _coerce_tempo_operacao(dados.get("tempo_operacao_meses"))
    percentual_financiamento = _round_percent(dados.get("percentual_financiamento"))
    prestacao_mensal_financiamento = _round_money(dados.get("prestacao_mensal_financiamento"))
    valor_estimado_venda = _round_money(dados.get("valor_estimado_venda"))

    reforma = _round_money(dados.get("reforma"))
    condominio_atraso = _round_money(dados.get("condominio_atraso"))
    iptu_atraso = _round_money(dados.get("iptu_atraso"))
    desocupacao = _round_money(dados.get("desocupacao"))
    documentacao = _round_money(dados.get("documentacao"))

    manutencao_agua_mensal = _round_money(dados.get("manutencao_agua_mensal"))
    manutencao_luz_mensal = _round_money(dados.get("manutencao_luz_mensal"))
    manutencao_condominio_mensal = _round_money(dados.get("manutencao_condominio_mensal"))
    manutencao_iptu_mensal = _round_money(dados.get("manutencao_iptu_mensal"))

    itbi_percentual, itbi_valor = _resolver_percentual_valor(
        valor_base_operacao,
        dados.get("itbi_percentual"),
        dados.get("itbi_valor"),
    )

    comissao_leiloeiro_percentual, comissao_leiloeiro_valor = _resolver_percentual_valor(
        valor_maximo_lance,
        dados.get("comissao_leiloeiro_percentual"),
        dados.get("comissao_leiloeiro_valor"),
    )

    comissao_corretor_percentual, comissao_corretor_valor = _resolver_percentual_valor(
        valor_estimado_venda,
        dados.get("comissao_corretor_percentual"),
        dados.get("comissao_corretor_valor"),
    )

    despesas_unicas = _round_money(
        reforma + condominio_atraso + iptu_atraso + desocupacao + documentacao + itbi_valor
    )
    despesa_mensal_total = _round_money(
        manutencao_agua_mensal +
        manutencao_luz_mensal +
        manutencao_condominio_mensal +
        manutencao_iptu_mensal
    )
    despesas_mensais_projetadas = _round_money(despesa_mensal_total * tempo_operacao_meses)
    custo_financiamento_projetado = _round_money(prestacao_mensal_financiamento * tempo_operacao_meses)

    valor_financiado = _round_money(valor_maximo_lance * (percentual_financiamento / 100))
    desembolso_aquisicao = _round_money(
        valor_maximo_lance - valor_financiado + comissao_leiloeiro_valor
    )

    custo_total_imovel = _round_money(
        valor_maximo_lance +
        comissao_leiloeiro_valor +
        despesas_unicas +
        despesas_mensais_projetadas
    )
    capital_investido_estimado = _round_money(
        desembolso_aquisicao +
        despesas_unicas +
        despesas_mensais_projetadas +
        custo_financiamento_projetado
    )

    base_ganho_capital = _round_money(max(
        (valor_estimado_venda - comissao_corretor_valor) - custo_total_imovel,
        0.0,
    ))
    ganho_capital_percentual, ganho_capital_valor = _resolver_percentual_valor(
        base_ganho_capital,
        dados.get("ganho_capital_percentual"),
        dados.get("ganho_capital_valor"),
    )

    lucro_esperado_valor = _round_money(
        valor_estimado_venda -
        comissao_corretor_valor -
        ganho_capital_valor -
        custo_total_imovel
    )
    roi_esperado_percentual = _round_percent(
        (lucro_esperado_valor / capital_investido_estimado) * 100
        if capital_investido_estimado > 0 else 0.0
    )

    return {
        "link_google_maps": (dados.get("link_google_maps") or "").strip() or None,
        "valor_base_operacao": valor_base_operacao,
        "tempo_operacao_meses": tempo_operacao_meses,
        "valor_maximo_lance": valor_maximo_lance,
        "percentual_financiamento": percentual_financiamento,
        "prestacao_mensal_financiamento": prestacao_mensal_financiamento,
        "valor_estimado_venda": valor_estimado_venda,
        "reforma": reforma,
        "condominio_atraso": condominio_atraso,
        "iptu_atraso": iptu_atraso,
        "desocupacao": desocupacao,
        "itbi_percentual": itbi_percentual,
        "itbi_valor": itbi_valor,
        "documentacao": documentacao,
        "manutencao_agua_mensal": manutencao_agua_mensal,
        "manutencao_luz_mensal": manutencao_luz_mensal,
        "manutencao_condominio_mensal": manutencao_condominio_mensal,
        "manutencao_iptu_mensal": manutencao_iptu_mensal,
        "comissao_leiloeiro_percentual": comissao_leiloeiro_percentual,
        "comissao_leiloeiro_valor": comissao_leiloeiro_valor,
        "comissao_corretor_percentual": comissao_corretor_percentual,
        "comissao_corretor_valor": comissao_corretor_valor,
        "ganho_capital_percentual": ganho_capital_percentual,
        "ganho_capital_valor": ganho_capital_valor,
        "despesas_unicas": despesas_unicas,
        "despesa_mensal_total": despesa_mensal_total,
        "despesas_mensais_projetadas": despesas_mensais_projetadas,
        "custo_financiamento_projetado": custo_financiamento_projetado,
        "valor_financiado": valor_financiado,
        "desembolso_aquisicao": desembolso_aquisicao,
        "custo_total_imovel": custo_total_imovel,
        "capital_investido_estimado": capital_investido_estimado,
        "base_ganho_capital": base_ganho_capital,
        "lucro_esperado_valor": lucro_esperado_valor,
        "roi_esperado_percentual": roi_esperado_percentual,
        "roi_esperado_valor": lucro_esperado_valor,
    }


def obter_analise_prospeccao_selecionado(numero_bem):
    _garantir_colunas_prospeccao_autoria()
    _garantir_tabela_prospeccao_analise()
    conn, cur = conectar()
    try:
        cur.execute(
            """
            SELECT
                s.numero_bem,
                s.valor_maximo,
                a.link_google_maps,
                a.valor_base_operacao,
                a.tempo_operacao_meses,
                a.valor_maximo_lance,
                a.percentual_financiamento,
                a.prestacao_mensal_financiamento,
                a.valor_estimado_venda,
                a.reforma,
                a.condominio_atraso,
                a.iptu_atraso,
                a.desocupacao,
                a.itbi_percentual,
                a.itbi_valor,
                a.documentacao,
                a.manutencao_agua_mensal,
                a.manutencao_luz_mensal,
                a.manutencao_condominio_mensal,
                a.manutencao_iptu_mensal,
                a.comissao_leiloeiro_percentual,
                a.comissao_leiloeiro_valor,
                a.comissao_corretor_percentual,
                a.comissao_corretor_valor,
                a.ganho_capital_percentual,
                a.ganho_capital_valor,
                a.created_by,
                COALESCE(NULLIF(cu.name, ''), NULLIF(a.created_by_name, ''), cu.email) AS created_by_name,
                a.updated_by,
                COALESCE(NULLIF(uu.name, ''), NULLIF(a.updated_by_name, ''), uu.email) AS updated_by_name,
                a.created_at,
                a.updated_at
            FROM imoveis_selecionados s
            LEFT JOIN imoveis_selecionados_analise a
                ON a.numero_bem = s.numero_bem
            LEFT JOIN users cu
                ON cu.id = a.created_by
            LEFT JOIN users uu
                ON uu.id = a.updated_by
            WHERE s.numero_bem = %s
            LIMIT 1
            """,
            (numero_bem,),
        )
        row = cur.fetchone()
        if not row:
            return None

        dados = {
            "numero_bem": row["numero_bem"],
            "link_google_maps": row["link_google_maps"],
            "valor_base_operacao": float(row["valor_base_operacao"]) if row["valor_base_operacao"] is not None else None,
            "tempo_operacao_meses": row["tempo_operacao_meses"] if row["tempo_operacao_meses"] is not None else 12,
            "valor_maximo_lance": float(row["valor_maximo_lance"]) if row["valor_maximo_lance"] is not None else (float(row["valor_maximo"]) if row["valor_maximo"] is not None else 0.0),
            "percentual_financiamento": float(row["percentual_financiamento"]) if row["percentual_financiamento"] is not None else 0.0,
            "prestacao_mensal_financiamento": float(row["prestacao_mensal_financiamento"]) if row["prestacao_mensal_financiamento"] is not None else 0.0,
            "valor_estimado_venda": float(row["valor_estimado_venda"]) if row["valor_estimado_venda"] is not None else 0.0,
            "reforma": float(row["reforma"]) if row["reforma"] is not None else 0.0,
            "condominio_atraso": float(row["condominio_atraso"]) if row["condominio_atraso"] is not None else 0.0,
            "iptu_atraso": float(row["iptu_atraso"]) if row["iptu_atraso"] is not None else 0.0,
            "desocupacao": float(row["desocupacao"]) if row["desocupacao"] is not None else 0.0,
            "itbi_percentual": float(row["itbi_percentual"]) if row["itbi_percentual"] is not None else None,
            "itbi_valor": float(row["itbi_valor"]) if row["itbi_valor"] is not None else None,
            "documentacao": float(row["documentacao"]) if row["documentacao"] is not None else 0.0,
            "manutencao_agua_mensal": float(row["manutencao_agua_mensal"]) if row["manutencao_agua_mensal"] is not None else 0.0,
            "manutencao_luz_mensal": float(row["manutencao_luz_mensal"]) if row["manutencao_luz_mensal"] is not None else 0.0,
            "manutencao_condominio_mensal": float(row["manutencao_condominio_mensal"]) if row["manutencao_condominio_mensal"] is not None else 0.0,
            "manutencao_iptu_mensal": float(row["manutencao_iptu_mensal"]) if row["manutencao_iptu_mensal"] is not None else 0.0,
            "comissao_leiloeiro_percentual": float(row["comissao_leiloeiro_percentual"]) if row["comissao_leiloeiro_percentual"] is not None else None,
            "comissao_leiloeiro_valor": float(row["comissao_leiloeiro_valor"]) if row["comissao_leiloeiro_valor"] is not None else None,
            "comissao_corretor_percentual": float(row["comissao_corretor_percentual"]) if row["comissao_corretor_percentual"] is not None else None,
            "comissao_corretor_valor": float(row["comissao_corretor_valor"]) if row["comissao_corretor_valor"] is not None else None,
            "ganho_capital_percentual": float(row["ganho_capital_percentual"]) if row["ganho_capital_percentual"] is not None else None,
            "ganho_capital_valor": float(row["ganho_capital_valor"]) if row["ganho_capital_valor"] is not None else None,
        }
        calculada = calcular_analise_prospeccao(dados)
        return {
            "numero_bem": numero_bem,
            "inputs": calculada,
            "calculos": {
                "despesas_unicas": calculada["despesas_unicas"],
                "despesa_mensal_total": calculada["despesa_mensal_total"],
                "despesas_mensais_projetadas": calculada["despesas_mensais_projetadas"],
                "custo_financiamento_projetado": calculada["custo_financiamento_projetado"],
                "valor_financiado": calculada["valor_financiado"],
                "desembolso_aquisicao": calculada["desembolso_aquisicao"],
                "custo_total_imovel": calculada["custo_total_imovel"],
                "capital_investido_estimado": calculada["capital_investido_estimado"],
                "base_ganho_capital": calculada["base_ganho_capital"],
                "lucro_esperado_valor": calculada["lucro_esperado_valor"],
                "roi_esperado_percentual": calculada["roi_esperado_percentual"],
                "roi_esperado_valor": calculada["roi_esperado_valor"],
            },
            "meta": {
                "created_by": row["created_by"],
                "created_by_name": row["created_by_name"],
                "updated_by": row["updated_by"],
                "updated_by_name": row["updated_by_name"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            },
        }
    finally:
        conn.close()


def salvar_analise_prospeccao_selecionado(numero_bem, payload, current_user_id=None, current_user_name=None):
    _garantir_colunas_prospeccao_autoria()
    _garantir_tabela_prospeccao_analise()
    conn, cur = conectar()
    try:
        cur.execute(
            "SELECT 1 FROM imoveis_selecionados WHERE numero_bem = %s LIMIT 1",
            (numero_bem,),
        )
        if not cur.fetchone():
            return None

        calculada = calcular_analise_prospeccao({
            **(payload or {}),
            "numero_bem": numero_bem,
        })

        cur.execute(
            """
            INSERT INTO imoveis_selecionados_analise (
                numero_bem,
                link_google_maps,
                valor_base_operacao,
                tempo_operacao_meses,
                valor_maximo_lance,
                percentual_financiamento,
                prestacao_mensal_financiamento,
                valor_estimado_venda,
                reforma,
                condominio_atraso,
                iptu_atraso,
                desocupacao,
                itbi_percentual,
                itbi_valor,
                documentacao,
                manutencao_agua_mensal,
                manutencao_luz_mensal,
                manutencao_condominio_mensal,
                manutencao_iptu_mensal,
                comissao_leiloeiro_percentual,
                comissao_leiloeiro_valor,
                comissao_corretor_percentual,
                comissao_corretor_valor,
                ganho_capital_percentual,
                ganho_capital_valor,
                created_by,
                created_by_name,
                updated_by,
                updated_by_name
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            ON CONFLICT (numero_bem) DO UPDATE
            SET
                link_google_maps = EXCLUDED.link_google_maps,
                valor_base_operacao = EXCLUDED.valor_base_operacao,
                tempo_operacao_meses = EXCLUDED.tempo_operacao_meses,
                valor_maximo_lance = EXCLUDED.valor_maximo_lance,
                percentual_financiamento = EXCLUDED.percentual_financiamento,
                prestacao_mensal_financiamento = EXCLUDED.prestacao_mensal_financiamento,
                valor_estimado_venda = EXCLUDED.valor_estimado_venda,
                reforma = EXCLUDED.reforma,
                condominio_atraso = EXCLUDED.condominio_atraso,
                iptu_atraso = EXCLUDED.iptu_atraso,
                desocupacao = EXCLUDED.desocupacao,
                itbi_percentual = EXCLUDED.itbi_percentual,
                itbi_valor = EXCLUDED.itbi_valor,
                documentacao = EXCLUDED.documentacao,
                manutencao_agua_mensal = EXCLUDED.manutencao_agua_mensal,
                manutencao_luz_mensal = EXCLUDED.manutencao_luz_mensal,
                manutencao_condominio_mensal = EXCLUDED.manutencao_condominio_mensal,
                manutencao_iptu_mensal = EXCLUDED.manutencao_iptu_mensal,
                comissao_leiloeiro_percentual = EXCLUDED.comissao_leiloeiro_percentual,
                comissao_leiloeiro_valor = EXCLUDED.comissao_leiloeiro_valor,
                comissao_corretor_percentual = EXCLUDED.comissao_corretor_percentual,
                comissao_corretor_valor = EXCLUDED.comissao_corretor_valor,
                ganho_capital_percentual = EXCLUDED.ganho_capital_percentual,
                ganho_capital_valor = EXCLUDED.ganho_capital_valor,
                updated_by = EXCLUDED.updated_by,
                updated_by_name = EXCLUDED.updated_by_name,
                updated_at = now()
            """,
            (
                numero_bem,
                calculada["link_google_maps"],
                calculada["valor_base_operacao"],
                calculada["tempo_operacao_meses"],
                calculada["valor_maximo_lance"],
                calculada["percentual_financiamento"],
                calculada["prestacao_mensal_financiamento"],
                calculada["valor_estimado_venda"],
                calculada["reforma"],
                calculada["condominio_atraso"],
                calculada["iptu_atraso"],
                calculada["desocupacao"],
                calculada["itbi_percentual"],
                calculada["itbi_valor"],
                calculada["documentacao"],
                calculada["manutencao_agua_mensal"],
                calculada["manutencao_luz_mensal"],
                calculada["manutencao_condominio_mensal"],
                calculada["manutencao_iptu_mensal"],
                calculada["comissao_leiloeiro_percentual"],
                calculada["comissao_leiloeiro_valor"],
                calculada["comissao_corretor_percentual"],
                calculada["comissao_corretor_valor"],
                calculada["ganho_capital_percentual"],
                calculada["ganho_capital_valor"],
                current_user_id,
                current_user_name,
                current_user_id,
                current_user_name,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return obter_analise_prospeccao_selecionado(numero_bem)


def inserir_prospeccao_selecionado(
    numero_bem,
    status="candidato",
    valor_maximo=None,
    prioridade=None,
    observacoes=None,
    created_by=None,
    created_by_name=None,
):
    _garantir_colunas_prospeccao_autoria()
    _garantir_tabela_prospeccao_observacoes()
    conn, cur = conectar()

    prioridade_val = None
    if isinstance(prioridade, str):
        normalized = prioridade.lower().replace("é", "e")
        if "alta" in normalized:
            prioridade_val = 3
        elif "baixa" in normalized:
            prioridade_val = 1
        elif "media" in normalized:
            prioridade_val = 2
    elif isinstance(prioridade, (int, float)):
        prioridade_val = int(prioridade)
    if prioridade_val is None:
        prioridade_val = 2  # padrão: média

    observacoes_val = (observacoes or "").strip() or None

    cur.execute(
        "SELECT observacoes FROM imoveis_selecionados WHERE numero_bem = %s",
        (numero_bem,),
    )
    row_existente = cur.fetchone()
    observacao_anterior = (row_existente[0].strip() if row_existente and row_existente[0] else None)

    cur.execute(
        """
        INSERT INTO imoveis_selecionados (
            numero_bem, status, valor_maximo, prioridade, observacoes, created_by, created_by_name, ativo
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE)
        ON CONFLICT (numero_bem) DO UPDATE
        SET status = EXCLUDED.status,
            valor_maximo = EXCLUDED.valor_maximo,
            prioridade = EXCLUDED.prioridade,
            observacoes = EXCLUDED.observacoes,
            created_by = CASE
                WHEN COALESCE(imoveis_selecionados.ativo, TRUE) = FALSE THEN EXCLUDED.created_by
                ELSE imoveis_selecionados.created_by
            END,
            created_by_name = CASE
                WHEN COALESCE(imoveis_selecionados.ativo, TRUE) = FALSE THEN EXCLUDED.created_by_name
                ELSE imoveis_selecionados.created_by_name
            END,
            ativo = TRUE,
            inativado_em = NULL,
            inativado_por = NULL,
            inativado_por_name = NULL,
            updated_at = now()
        """,
        (
            numero_bem,
            status or "candidato",
            valor_maximo,
            prioridade_val,
            observacoes_val,
            created_by,
            created_by_name,
        ),
    )

    if observacoes_val and observacoes_val != observacao_anterior:
        cur.execute(
            """
            INSERT INTO imoveis_selecionados_observacoes (
                numero_bem, observacao, created_by, created_by_name
            )
            VALUES (%s, %s, %s, %s)
            """,
            (numero_bem, observacoes_val, created_by, created_by_name),
        )
    conn.commit()
    conn.close()
    return {"message": "Imóvel adicionado/atualizado em selecionados", "numero_bem": numero_bem}


def buscar_contexto_operacao_prospeccao_selecionado(numero_bem):
    _garantir_tabela_prospeccao_responsaveis()
    conn, cur = conectar()
    try:
        cur.execute(
            """
            SELECT numero_bem, created_by, created_by_name, COALESCE(ativo, TRUE) AS ativo
            FROM imoveis_selecionados
            WHERE numero_bem = %s
            LIMIT 1
            """,
            (numero_bem,),
        )
        row = cur.fetchone()
        if not row:
            return None

        cur.execute(
            """
            SELECT user_id
            FROM imoveis_selecionados_responsaveis
            WHERE numero_bem = %s
            """,
            (numero_bem,),
        )
        responsavel_ids = [item[0] for item in cur.fetchall()]
        return {
            "numero_bem": row[0],
            "created_by": row[1],
            "created_by_name": row[2],
            "ativo": row[3],
            "responsavel_ids": responsavel_ids,
        }
    finally:
        conn.close()


def buscar_autoria_prospeccao_selecionado(numero_bem):
    conn, cur = conectar()
    try:
        cur.execute(
            """
            SELECT numero_bem, created_by, created_by_name, COALESCE(ativo, TRUE) AS ativo
            FROM imoveis_selecionados
            WHERE numero_bem = %s
            LIMIT 1
            """,
            (numero_bem,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "numero_bem": row[0],
            "created_by": row[1],
            "created_by_name": row[2],
            "ativo": row[3],
        }
    finally:
        conn.close()


def listar_prospectores_ativos():
    _garantir_tabela_prospeccao_responsaveis()
    conn, cur = conectar()
    try:
        cur.execute(
            """
            SELECT id, name, email, role
            FROM users
            WHERE COALESCE(is_active, TRUE) = TRUE
              AND role = 'prospector'
            ORDER BY COALESCE(NULLIF(name, ''), email), email
            """
        )
        rows = cur.fetchall()
        return [
            {
                "id": row["id"],
                "name": row["name"],
                "email": row["email"],
                "role": row["role"],
            }
            for row in rows
        ]
    finally:
        conn.close()


def salvar_responsaveis_prospeccao_selecionado(
    numero_bem,
    user_ids,
    assigned_by=None,
    assigned_by_name=None,
):
    _garantir_tabela_prospeccao_responsaveis()
    conn, cur = conectar()
    try:
        cur.execute(
            """
            SELECT numero_bem
            FROM imoveis_selecionados
            WHERE numero_bem = %s
              AND COALESCE(ativo, TRUE) = TRUE
            LIMIT 1
            """,
            (numero_bem,),
        )
        if not cur.fetchone():
            return None

        normalized_ids = []
        for raw_id in user_ids or []:
            try:
                user_id = int(raw_id)
            except (TypeError, ValueError):
                continue
            if user_id not in normalized_ids:
                normalized_ids.append(user_id)

        if normalized_ids:
            cur.execute(
                """
                SELECT id
                FROM users
                WHERE id = ANY(%s)
                  AND COALESCE(is_active, TRUE) = TRUE
                  AND role = 'prospector'
                """,
                (normalized_ids,),
            )
            valid_ids = {row[0] for row in cur.fetchall()}
            invalid_ids = [user_id for user_id in normalized_ids if user_id not in valid_ids]
            if invalid_ids:
                raise ValueError("Há responsáveis inválidos ou inativos na seleção.")
        else:
            valid_ids = set()

        cur.execute(
            "DELETE FROM imoveis_selecionados_responsaveis WHERE numero_bem = %s",
            (numero_bem,),
        )

        for user_id in normalized_ids:
            if user_id not in valid_ids:
                continue
            cur.execute(
                """
                INSERT INTO imoveis_selecionados_responsaveis (
                    numero_bem,
                    user_id,
                    assigned_by,
                    assigned_by_name
                )
                VALUES (%s, %s, %s, %s)
                """,
                (numero_bem, user_id, assigned_by, assigned_by_name),
            )

        conn.commit()
    finally:
        conn.close()

    contexto = buscar_contexto_operacao_prospeccao_selecionado(numero_bem) or {}
    return {
        "numero_bem": numero_bem,
        "responsavel_ids": contexto.get("responsavel_ids", []),
    }


def excluir_prospeccao_selecionado(numero_bem, inativado_por=None, inativado_por_name=None):
    conn, cur = conectar()
    try:
        cur.execute(
            """
            UPDATE imoveis_selecionados
            SET
                ativo = FALSE,
                inativado_em = now(),
                inativado_por = %s,
                inativado_por_name = %s,
                updated_at = now()
            WHERE numero_bem = %s
              AND COALESCE(ativo, TRUE) = TRUE
            """,
            (inativado_por, inativado_por_name, numero_bem),
        )
        removidos = cur.rowcount
        conn.commit()
        if removidos == 0:
            return {"deleted": False, "numero_bem": numero_bem, "message": "Imóvel não encontrado em selecionados"}
        return {"deleted": True, "numero_bem": numero_bem, "message": "Imóvel removido da fila de selecionados"}
    finally:
        conn.close()


def listar_prospeccoes_meta():
    conn, cur = conectar()
    cur.execute("SELECT DISTINCT uf FROM vw_imoveis_prospeccao_latest WHERE uf IS NOT NULL")
    ufs = sorted({row[0] for row in cur.fetchall() if row[0]})

    cur.execute("SELECT DISTINCT tipo_venda FROM vw_imoveis_prospeccao_latest WHERE tipo_venda IS NOT NULL")
    modalidades = sorted({row[0] for row in cur.fetchall() if row[0]})

    cur.execute("SELECT DISTINCT financia FROM vw_imoveis_prospeccao_latest WHERE financia IS NOT NULL")
    financia = sorted({ "sim" if row[0] else "nao" for row in cur.fetchall() })

    cur.execute("SELECT uf, cidade FROM vw_imoveis_prospeccao_latest WHERE uf IS NOT NULL AND cidade IS NOT NULL")
    cidades_por_uf = {}
    for uf, cidade in cur.fetchall():
        uf_key = uf.strip()
        if not uf_key:
            continue
        cidades_por_uf.setdefault(uf_key, set()).add(cidade.strip())
    cidades_por_uf = {uf: sorted(list(cidades)) for uf, cidades in cidades_por_uf.items()}

    conn.close()
    return {"ufs": ufs, "modalidades": modalidades, "financia": financia, "cidades_por_uf": cidades_por_uf}

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


def atualizar_lancamentos_em_lote(ids, updates):
    if not isinstance(ids, list) or not ids:
        raise ValueError("Selecione pelo menos um lançamento")

    try:
        ids_normalizados = sorted({int(i) for i in ids})
    except Exception as exc:
        raise ValueError("IDs inválidos") from exc

    campos_permitidos = {"id_categoria", "id_imovel", "id_situacao", "data", "valor", "descricao"}
    if not isinstance(updates, dict) or not any(chave in campos_permitidos for chave in updates.keys()):
        raise ValueError("Informe pelo menos um campo para atualização")

    set_clauses = []
    valores = []

    conn, cur = conectar()

    try:
        cur.execute("SELECT id FROM lancamentos WHERE id = ANY(%s)", (ids_normalizados,))
        encontrados = [row[0] if not isinstance(row, dict) else row["id"] for row in cur.fetchall()]
        if not encontrados:
            raise LookupError("Nenhum lançamento encontrado")

        if "id_categoria" in updates:
            categoria_raw = updates.get("id_categoria")
            if categoria_raw in (None, ""):
                raise ValueError("Categoria inválida")
            try:
                categoria_id = int(categoria_raw)
            except Exception as exc:
                raise ValueError("Categoria inválida") from exc
            if categoria_id < 0:
                raise ValueError("Categoria inválida")
            if categoria_id != 0:
                cur.execute("SELECT 1 FROM categorias WHERE id = %s", (categoria_id,))
                if not cur.fetchone():
                    raise ValueError("Categoria não encontrada")
            set_clauses.append("id_categoria = %s")
            valores.append(categoria_id)

        if "id_imovel" in updates:
            imovel_raw = updates.get("id_imovel")
            if imovel_raw in (None, ""):
                raise ValueError("Imóvel inválido")
            try:
                imovel_id = int(imovel_raw)
            except Exception as exc:
                raise ValueError("Imóvel inválido") from exc
            cur.execute("SELECT 1 FROM imoveis WHERE id = %s", (imovel_id,))
            if not cur.fetchone():
                raise ValueError("Imóvel não encontrado")
            set_clauses.append("id_imovel = %s")
            valores.append(imovel_id)

        if "id_situacao" in updates:
            situacao_raw = updates.get("id_situacao")
            if situacao_raw in (None, ""):
                raise ValueError("Situação inválida")
            try:
                situacao = int(situacao_raw)
            except Exception as exc:
                raise ValueError("Situação inválida") from exc
            if situacao not in {0, 1}:
                raise ValueError("Situação inválida")
            set_clauses.append("id_situacao = %s")
            valores.append(situacao)

        if "data" in updates:
            data_raw = (updates.get("data") or "").strip()
            if not data_raw:
                raise ValueError("Data inválida")
            data_formatada = converter_data(data_raw)
            set_clauses.append("data = %s")
            valores.append(data_formatada)

        if "valor" in updates:
            valor_raw = updates.get("valor")
            if valor_raw in (None, ""):
                raise ValueError("Valor inválido")
            try:
                valor_num = float(valor_raw)
            except Exception as exc:
                raise ValueError("Valor inválido") from exc
            set_clauses.append("valor = %s")
            valores.append(valor_num)

        if "descricao" in updates:
            descricao_raw = (updates.get("descricao") or "").strip()
            if not descricao_raw:
                raise ValueError("Descrição inválida")
            set_clauses.append("descricao = %s")
            valores.append(descricao_raw)

        if not set_clauses:
            raise ValueError("Nenhum campo válido para atualizar")

        valores.append(ids_normalizados)
        cur.execute(
            f"""
            UPDATE lancamentos
               SET {', '.join(set_clauses)}
             WHERE id = ANY(%s)
            """,
            tuple(valores),
        )
        conn.commit()
        return cur.rowcount
    except LookupError:
        conn.rollback()
        raise
    except ValueError:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    if cidades:
        placeholders = ",".join(["LOWER(%s)"] * len(cidades))
        conditions.append(f"LOWER(cidade) IN ({placeholders})")
        params.extend([item.lower() for item in cidades])
