#!/usr/bin/env python3
"""Resolve and commit family financial entries from short Telegram text."""

from __future__ import annotations

import argparse
import base64
import calendar
import html as html_lib
import json
import mimetypes
import os
import re
import shlex
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import requests


def preload_env_file(path: str) -> None:
    try:
        lines = Path(path).read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


preload_env_file("/root/.openclaw/secrets/publisher.env")

ENV_PATH = Path("/root/.openclaw/workspace/inactive/data/imoveis_sources/garimpo/.env")
OPENCLAW_CONFIG_PATH = Path("/root/.openclaw/openclaw.json")
GATEWAY_ENV_PATH = Path("/root/.openclaw/secrets/gateway.env")
BUSINESS_TIMEZONE = "America/Sao_Paulo"
OFFLINE_REFERENCE_DATE = "2026-05-05"
ALLOWED_GROUP_ENV = "FINANCEIRO_FAMILIAR_TELEGRAM_GROUP_ID"
CATALOG_CACHE_PATH = Path("/root/.openclaw/workspace/memory/financeiro-familiar-catalog-cache.json")
CATALOG_CACHE_TTL_SECONDS = 300
CATEGORY_AI_CACHE_PATH = Path("/root/.openclaw/workspace/memory/financeiro-familiar-category-ai-cache.json")
CATEGORY_AI_CACHE_TTL_SECONDS = int(os.environ.get("FINANCEIRO_FAMILIAR_CATEGORY_AI_CACHE_TTL", str(30 * 24 * 60 * 60)))
WORKSPACE_ROOT = Path(os.environ.get("WORKSPACE_ROOT", str(Path(__file__).resolve().parents[1])))
PUBLISHED_DIR = Path(os.environ.get("PUBLISHED_DIR", str(WORKSPACE_ROOT / "published")))
DASHBOARD_TTL_SECONDS = int(os.environ.get("FINANCEIRO_FAMILIAR_DASHBOARD_TTL", "3600"))
PUBLISHER_URL = os.environ.get("PUBLISHER_URL", "http://127.0.0.1:8099/publish")
CATEGORY_GEMINI_MODEL = os.environ.get("FINANCEIRO_FAMILIAR_CATEGORY_GEMINI_MODEL") or os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
CATEGORY_AI_NOTICE = ""
MONTH_NAMES = {
    "janeiro": 1,
    "jan": 1,
    "fevereiro": 2,
    "fev": 2,
    "marco": 3,
    "março": 3,
    "mar": 3,
    "abril": 4,
    "abr": 4,
    "maio": 5,
    "mai": 5,
    "junho": 6,
    "jun": 6,
    "julho": 7,
    "jul": 7,
    "agosto": 8,
    "ago": 8,
    "setembro": 9,
    "set": 9,
    "outubro": 10,
    "out": 10,
    "novembro": 11,
    "nov": 11,
    "dezembro": 12,
    "dez": 12,
}

ALLOWED_INTENT_ACTIONS = {"criar_lancamento_familiar", "corrigir_lancamento_familiar"}
ALLOWED_INTENT_KEYS = {
    "action",
    "data",
    "categoria",
    "valor",
    "descricao",
    "usuario",
    "usuario_lancamento",
    "conta",
    "tipo",
    "parcelas",
    "comprovante_url",
    "observacao",
}
EDIT_REQUEST_MARKER = "PEDIDO_EDICAO_FAMILIAR"
BATCH_INSERT_MARKER = "PEDIDO_INCLUSAO_LOTE_FAMILIAR"
STATEMENT_CLOSE_MARKER = "PEDIDO_FECHAMENTO_FATURA_FAMILIAR"
EDIT_COMMIT_FIELDS = {
    "data",
    "valor",
    "tipo",
    "descricao",
    "usuario_lancamento_id",
    "conta_id",
    "categoria_id",
    "observacao",
}
STATEMENT_FIELDS = {
    "competencia_mes",
    "fatura_periodo_inicio",
    "fatura_periodo_fim",
    "fatura_vencimento",
}
STATEMENT_CONCILIATION_FIELDS = {
    "fatura_id",
}
BATCH_ENTRY_FIELDS = (
    "data",
    "valor",
    "tipo",
    "descricao",
    "usuario_lancamento_id",
    "conta_id",
    "categoria_id",
    "created_by_usuario_id",
    "parcelamento_grupo_id",
    "parcela_atual",
    "parcelas_total",
    "ativo",
)
AUDIT_COMMIT_FIELDS = (
    "auditoria_origem",
    "auditoria_sessao",
    "auditoria_usuario_solicitante",
    "auditoria_confirmado_em",
)
FORBIDDEN_PATTERNS = [
    r"\b(apagar|apague|deletar|delete|excluir|remover|truncate|drop)\b",
    r"\b(alterar|atualizar|update)\s+(?:registro|lan[cç]amento|banco|tabela)\b",
    r"\b(sql|query|comando\s+sql)\b",
    r"\b(lote|batch|massa|planilha|csv|importar|todos|todas|varios|v[aá]rios)\b",
    r"\b(upsert|merge|replace)\b",
]
EDITABLE_FIELDS = {
    "categoria": "categoria",
    "valor": "valor",
    "data": "data",
    "descricao": "descricao",
    "descrição": "descricao",
    "desc": "descricao",
    "usuario": "usuario",
    "usuário": "usuario",
    "conta": "conta",
    "cartao": "conta",
    "cartão": "conta",
    "tipo": "tipo",
    "parcelas": "parcelas",
    "observacao": "observacao",
    "observação": "observacao",
}

DEFAULT_GROUPS = [
    {"id": 1, "nome": "Casa & Manutenção", "ordem": 10, "ativo": True},
    {"id": 2, "nome": "Mobilidade", "ordem": 20, "ativo": True},
    {"id": 3, "nome": "Thiago", "ordem": 30, "ativo": True},
    {"id": 4, "nome": "Lucas", "ordem": 40, "ativo": True},
    {"id": 5, "nome": "Apoio Familiar", "ordem": 50, "ativo": True},
    {"id": 6, "nome": "Alimentação", "ordem": 60, "ativo": True},
    {"id": 7, "nome": "Despesas Pessoais", "ordem": 70, "ativo": True},
    {"id": 8, "nome": "Estilo de Vida", "ordem": 80, "ativo": True},
    {"id": 9, "nome": "Projetos", "ordem": 90, "ativo": True},
    {"id": 10, "nome": "Receitas", "ordem": 100, "ativo": True},
    {"id": 11, "nome": "A recuperar", "ordem": 85, "ativo": True},
]
DEFAULT_USERS = [
    {"id": 1, "nome": "Matheus", "ativo": True},
    {"id": 2, "nome": "Carol", "ativo": True},
]
DEFAULT_ACCOUNTS = [
    {"id": 1, "nome": "CAIXA Matheus", "tipo": "conta_corrente", "ativa": True, "titular_usuario_id": 1},
    {"id": 2, "nome": "Cartão CAIXA Visa", "tipo": "cartao_credito", "ativa": True, "titular_usuario_id": 1},
    {"id": 3, "nome": "Cartão CAIXA Master", "tipo": "cartao_credito", "ativa": True, "titular_usuario_id": 1},
    {"id": 4, "nome": "Cartão CAIXA Elo", "tipo": "cartao_credito", "ativa": True, "titular_usuario_id": 1},
    {"id": 5, "nome": "Banco do Brasil Carol", "tipo": "conta_corrente", "ativa": True, "titular_usuario_id": 2},
    {"id": 6, "nome": "Cartão BB Visa Carol", "tipo": "cartao_credito", "ativa": True, "titular_usuario_id": 2},
    {"id": 7, "nome": "Cartão CAIXA Visa (mãe Carol)", "tipo": "cartao_credito", "ativa": True, "titular_usuario_id": 2},
]
DEFAULT_CATEGORIES = [
    {"id": 1, "grupo_id": 1, "nome": "Condomínio", "tipo_padrao": "fixo", "palavras_chave": ["condominio"], "ativa": True},
    {"id": 2, "grupo_id": 1, "nome": "Energia", "tipo_padrao": "variavel", "palavras_chave": ["energia", "luz", "copel"], "ativa": True},
    {"id": 3, "grupo_id": 1, "nome": "Água", "tipo_padrao": "variavel", "palavras_chave": ["agua", "sanepar"], "ativa": True},
    {"id": 4, "grupo_id": 1, "nome": "Gás", "tipo_padrao": "variavel", "palavras_chave": ["gas"], "ativa": True},
    {"id": 5, "grupo_id": 1, "nome": "Internet", "tipo_padrao": "fixo", "palavras_chave": ["internet", "fibra", "wifi"], "ativa": True},
    {"id": 6, "grupo_id": 1, "nome": "Diarista / Limpeza", "tipo_padrao": "fixo", "palavras_chave": ["diarista", "faxina", "limpeza", "valdira"], "ativa": True},
    {"id": 7, "grupo_id": 1, "nome": "Jardineiro", "tipo_padrao": "fixo", "palavras_chave": ["jardineiro", "jardim"], "ativa": True},
    {"id": 8, "grupo_id": 1, "nome": "Piscineiro", "tipo_padrao": "fixo", "palavras_chave": ["piscineiro", "piscina"], "ativa": True},
    {"id": 9, "grupo_id": 1, "nome": "Manutenção", "tipo_padrao": "variavel", "palavras_chave": ["arrumar", "conserto", "manutencao", "maquina de lavar"], "ativa": True},
    {"id": 10, "grupo_id": 1, "nome": "Produtos de limpeza", "tipo_padrao": "variavel", "palavras_chave": ["produto de limpeza", "produtos de limpeza"], "ativa": True},
    {"id": 11, "grupo_id": 1, "nome": "Utensílios", "tipo_padrao": "variavel", "palavras_chave": ["utensilio", "utensilios", "utensilhos", "utilidade", "utilidades", "inovautilidades", "panela", "copo", "prato"], "ativa": True},
    {"id": 59, "grupo_id": 1, "nome": "IPTU / taxas", "tipo_padrao": "fixo", "palavras_chave": ["iptu", "taxa de lixo", "taxas da casa", "tributo municipal"], "ativa": True},
    {"id": 61, "grupo_id": 1, "nome": "Móveis / decoração", "tipo_padrao": "variavel", "palavras_chave": ["movel", "moveis", "móvel", "móveis", "decoracao", "decoração", "cadeira", "mesa", "sofa", "sofá", "estante", "rack"], "ativa": True},
    {"id": 12, "grupo_id": 2, "nome": "Prestação / financiamento", "tipo_padrao": "fixo", "palavras_chave": ["prestacao", "financiamento"], "ativa": True},
    {"id": 13, "grupo_id": 2, "nome": "Seguro", "tipo_padrao": "fixo", "palavras_chave": ["seguro"], "ativa": True},
    {"id": 14, "grupo_id": 2, "nome": "Combustível", "tipo_padrao": "variavel", "palavras_chave": ["combustivel", "gasolina", "alcool", "etanol", "posto"], "ativa": True},
    {"id": 15, "grupo_id": 2, "nome": "Energia (recarga)", "tipo_padrao": "variavel", "palavras_chave": ["recarga", "carro eletrico"], "ativa": True},
    {"id": 16, "grupo_id": 2, "nome": "Manutenção", "tipo_padrao": "variavel", "palavras_chave": ["oficina", "revisao", "pneu"], "ativa": True},
    {"id": 17, "grupo_id": 2, "nome": "Lavagem", "tipo_padrao": "variavel", "palavras_chave": ["lavagem", "lava car"], "ativa": True},
    {"id": 18, "grupo_id": 2, "nome": "IPVA / licenciamento", "tipo_padrao": "fixo", "palavras_chave": ["ipva", "licenciamento"], "ativa": True},
    {"id": 19, "grupo_id": 2, "nome": "Estacionamento / pedágio", "tipo_padrao": "variavel", "palavras_chave": ["estacionamento", "pedagio", "pedágio", "manobrista", "valet"], "ativa": True},
    {"id": 20, "grupo_id": 2, "nome": "Transporte por app", "tipo_padrao": "variavel", "palavras_chave": ["uber", "99", "taxi"], "ativa": True},
    {"id": 21, "grupo_id": 3, "nome": "Saúde", "tipo_padrao": "variavel", "palavras_chave": ["thiago saude", "thiago medico"], "ativa": True},
    {"id": 22, "grupo_id": 3, "nome": "Educação", "tipo_padrao": "fixo", "palavras_chave": ["thiago escola", "thiago educacao"], "ativa": True},
    {"id": 23, "grupo_id": 3, "nome": "Atividades", "tipo_padrao": "fixo", "palavras_chave": ["thiago atividade"], "ativa": True},
    {"id": 24, "grupo_id": 3, "nome": "Lazer / presentes", "tipo_padrao": "variavel", "palavras_chave": ["thiago presente", "thiago lazer"], "ativa": True},
    {"id": 25, "grupo_id": 3, "nome": "Extras", "tipo_padrao": "variavel", "palavras_chave": ["thiago extra"], "ativa": True},
    {"id": 26, "grupo_id": 4, "nome": "Escola", "tipo_padrao": "fixo", "palavras_chave": ["lucas escola"], "ativa": True},
    {"id": 27, "grupo_id": 4, "nome": "Material escolar", "tipo_padrao": "variavel", "palavras_chave": ["lucas material escolar"], "ativa": True},
    {"id": 28, "grupo_id": 4, "nome": "Babá", "tipo_padrao": "fixo", "palavras_chave": ["baba", "lucas baba"], "ativa": True},
    {"id": 29, "grupo_id": 4, "nome": "Saúde", "tipo_padrao": "variavel", "palavras_chave": ["lucas saude", "lucas medico"], "ativa": True},
    {"id": 30, "grupo_id": 4, "nome": "Atividades", "tipo_padrao": "fixo", "palavras_chave": ["lucas atividade"], "ativa": True},
    {"id": 31, "grupo_id": 4, "nome": "Lazer / presentes", "tipo_padrao": "variavel", "palavras_chave": ["lucas presente", "lucas lazer"], "ativa": True},
    {"id": 32, "grupo_id": 4, "nome": "Extras", "tipo_padrao": "variavel", "palavras_chave": ["lucas extra"], "ativa": True},
    {"id": 33, "grupo_id": 5, "nome": "Ajuda mensal", "tipo_padrao": "fixo", "palavras_chave": ["ajuda mensal"], "ativa": True},
    {"id": 34, "grupo_id": 5, "nome": "Apoios extras", "tipo_padrao": "variavel", "palavras_chave": ["apoio extra", "ajuda extra"], "ativa": True},
    {"id": 35, "grupo_id": 6, "nome": "Supermercado", "tipo_padrao": "variavel", "palavras_chave": ["mercado", "supermercado", "varejao", "açougue", "acougue", "carnes"], "ativa": True},
    {"id": 36, "grupo_id": 6, "nome": "Padaria / conveniência", "tipo_padrao": "variavel", "palavras_chave": ["padaria", "conveniencia"], "ativa": True},
    {"id": 37, "grupo_id": 6, "nome": "Restaurantes", "tipo_padrao": "variavel", "palavras_chave": ["restaurante", "almoco", "jantar", "lanche", "cafe", "café", "refeicao", "refeição", "subway", "marzuk"], "ativa": True},
    {"id": 38, "grupo_id": 6, "nome": "Delivery", "tipo_padrao": "variavel", "palavras_chave": ["ifood", "delivery", "pizza"], "ativa": True},
    {"id": 39, "grupo_id": 7, "nome": "Farmácia", "tipo_padrao": "variavel", "palavras_chave": ["farmacia", "remedio", "medicamento"], "ativa": True},
    {"id": 40, "grupo_id": 6, "nome": "Outros alimentação", "tipo_padrao": "variavel", "palavras_chave": ["alimentacao", "alimentação", "comida", "bebida"], "ativa": True},
    {"id": 41, "grupo_id": 7, "nome": "Salão de beleza", "tipo_padrao": "variavel", "palavras_chave": ["salao", "beleza"], "ativa": True},
    {"id": 42, "grupo_id": 7, "nome": "Barbearia", "tipo_padrao": "variavel", "palavras_chave": ["barbearia", "barba"], "ativa": True},
    {"id": 43, "grupo_id": 7, "nome": "Vestuário", "tipo_padrao": "variavel", "palavras_chave": ["roupa", "vestuario", "calcado", "tenis"], "ativa": True},
    {"id": 44, "grupo_id": 7, "nome": "Saúde pessoal", "tipo_padrao": "variavel", "palavras_chave": ["saude pessoal", "consulta", "exame"], "ativa": True},
    {"id": 45, "grupo_id": 7, "nome": "Academia", "tipo_padrao": "fixo", "palavras_chave": ["academia"], "ativa": True},
    {"id": 46, "grupo_id": 7, "nome": "Assinaturas", "tipo_padrao": "fixo", "palavras_chave": ["assinatura", "netflix", "spotify", "streaming", "apple.com/bill", "apple", "ifood club"], "ativa": True},
    {"id": 47, "grupo_id": 7, "nome": "Lazer", "tipo_padrao": "variavel", "palavras_chave": ["lazer pessoal"], "ativa": True},
    {"id": 48, "grupo_id": 7, "nome": "Outros pessoais", "tipo_padrao": "variavel", "palavras_chave": ["pessoal"], "ativa": True},
    {"id": 62, "grupo_id": 7, "nome": "Eletrônicos / acessórios", "tipo_padrao": "variavel", "palavras_chave": ["eletronico", "eletronicos", "eletrônico", "eletrônicos", "acessorio", "acessorios", "acessório", "acessórios", "ipad", "tablet", "celular", "fone", "carregador", "capa ipad", "capa celular"], "ativa": True},
    {"id": 63, "grupo_id": 7, "nome": "Telefone / celular", "tipo_padrao": "fixo", "palavras_chave": ["celular", "telefone", "fatura celular", "conta celular", "plano celular", "vivo", "claro", "tim"], "ativa": True},
    {"id": 49, "grupo_id": 8, "nome": "Viagens", "tipo_padrao": "projeto", "palavras_chave": ["viagem", "hotel", "passagem"], "ativa": True},
    {"id": 51, "grupo_id": 8, "nome": "Presentes", "tipo_padrao": "variavel", "palavras_chave": ["presente"], "ativa": True},
    {"id": 52, "grupo_id": 8, "nome": "Experiências", "tipo_padrao": "variavel", "palavras_chave": ["experiencia"], "ativa": True},
    {"id": 53, "grupo_id": 8, "nome": "Outros", "tipo_padrao": "variavel", "palavras_chave": ["outros"], "ativa": True},
    {"id": 54, "grupo_id": 9, "nome": "Casamento", "tipo_padrao": "projeto", "palavras_chave": ["casamento", "noivado", "festa", "cerimonia", "buffet", "alianca", "aliancas", "anel", "aneis", "joalheria", "vestido", "decoracao", "fotografo", "foto", "filmagem", "convite", "lua de mel"], "ativa": True},
    {"id": 55, "grupo_id": 10, "nome": "Salário", "tipo_padrao": "fixo", "palavras_chave": ["salario", "pro labore", "pro-labore"], "ativa": True},
    {"id": 56, "grupo_id": 10, "nome": "Rendimentos", "tipo_padrao": "variavel", "palavras_chave": ["rendimento", "juros recebido", "dividendo"], "ativa": True},
    {"id": 57, "grupo_id": 10, "nome": "Reembolso", "tipo_padrao": "variavel", "palavras_chave": ["reembolso", "reembolsou"], "ativa": True},
    {"id": 58, "grupo_id": 10, "nome": "Outras receitas", "tipo_padrao": "variavel", "palavras_chave": ["recebi", "entrada", "receita"], "ativa": True},
    {"id": 60, "grupo_id": 10, "nome": "Retirada (imóveis)", "tipo_padrao": "variavel", "palavras_chave": ["retirada imoveis", "retirada imóveis", "imoveis", "imóveis", "repasse imoveis", "repasse imóveis"], "ativa": True},
    {"id": 64, "grupo_id": 11, "nome": "Imóveis", "tipo_padrao": "variavel", "palavras_chave": ["a recuperar imoveis", "a recuperar imóveis", "restituir imoveis", "restituir imóveis", "restituicao imoveis", "restituição imóveis", "imoveis a restituir", "imóveis a restituir"], "ativa": True},
    {"id": 65, "grupo_id": 11, "nome": "Trabalho", "tipo_padrao": "variavel", "palavras_chave": ["a recuperar trabalho", "restituir trabalho", "reembolso trabalho", "conta do trabalho", "despesa do trabalho"], "ativa": True},
    {"id": 66, "grupo_id": 11, "nome": "Amigos / colegas", "tipo_padrao": "variavel", "palavras_chave": ["a recuperar amigos", "a recuperar colegas", "colegas vao devolver", "amigos vao devolver", "rateio", "dividir com colegas"], "ativa": True},
    {"id": 67, "grupo_id": 11, "nome": "Família", "tipo_padrao": "variavel", "palavras_chave": ["a recuperar familia", "a recuperar família", "restituir familia", "restituir família"], "ativa": True},
    {"id": 68, "grupo_id": 11, "nome": "Outros", "tipo_padrao": "variavel", "palavras_chave": ["a recuperar", "a restituir", "restituir", "restituicao", "restituição"], "ativa": True},
]


def load_env(path: Path = ENV_PATH) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_runtime_env() -> None:
    load_env(ENV_PATH)
    load_env(GATEWAY_ENV_PATH)


def norm(value: Any) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[^a-zA-Z0-9]+", " ", text.lower())
    return re.sub(r"\s+", " ", text).strip()


def money_to_decimal(raw: str | Decimal | int | float | None) -> Decimal | None:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    text = re.sub(r"(?i)r\$\s*", "", text).replace(" ", "")
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(?:\.\d{3})+", text):
        text = text.replace(".", "")
    try:
        value = Decimal(text)
    except Exception:
        return None
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def money_json(value: Decimal | str | int | float | None) -> str:
    decimal = money_to_decimal(value)
    return f"{decimal:.2f}" if decimal is not None else "0.00"


def brl(value: Decimal | str | int | float | None) -> str:
    decimal = money_to_decimal(value) or Decimal("0.00")
    formatted = f"{decimal:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {formatted}"


def business_today() -> date:
    return datetime.now(ZoneInfo(BUSINESS_TIMEZONE)).date()


def relative_today() -> date:
    override = os.environ.get("FINANCEIRO_FAMILIAR_REFERENCE_DATE", "").strip()
    if override:
        return date.fromisoformat(override)
    return business_today()


def parse_date(raw: str | None) -> str | None:
    if not raw:
        return None
    text = norm(raw)
    today = relative_today()
    if text == "hoje":
        return today.isoformat()
    if text == "ontem":
        return (today - timedelta(days=1)).isoformat()
    value = str(raw).strip()
    match = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", value)
    if match:
        date.fromisoformat(value)
        return value
    match = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", value)
    if match:
        day, month, year = match.groups()
        return date(int(year), int(month), int(day)).isoformat()
    match = re.fullmatch(r"(\d{1,2})/(\d{1,2})", value)
    if match:
        day, month = match.groups()
        return date(today.year, int(month), int(day)).isoformat()
    return None


def add_months(value: str, months: int) -> str:
    base = date.fromisoformat(value)
    month_index = base.month - 1 + months
    year = base.year + month_index // 12
    month = month_index % 12 + 1
    day = min(base.day, calendar.monthrange(year, month)[1])
    return date(year, month, day).isoformat()


def date_with_clamped_day(year: int, month: int, day: int) -> date:
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def month_range(year: int, month: int) -> tuple[date, date]:
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def parse_report_period(text: str) -> tuple[date, date, str]:
    clean = norm(text)
    today = business_today()
    if any(phrase in clean for phrase in ["mes passado", "mes anterior", "mês passado", "mês anterior"]):
        base = add_months(today.replace(day=1).isoformat(), -1)
        start = date.fromisoformat(base)
        first, last = month_range(start.year, start.month)
        return first, last, f"{first.strftime('%m/%Y')}"
    if any(phrase in clean for phrase in ["esse mes", "este mes", "deste mes", "desse mes", "mes atual", "mês atual", "esse mês", "este mês"]):
        first, last = month_range(today.year, today.month)
        return first, last, f"{first.strftime('%m/%Y')}"
    year_match = re.search(r"\b(20\d{2})\b", str(text or ""))
    year = int(year_match.group(1)) if year_match else today.year
    for name, month in MONTH_NAMES.items():
        if name in clean.split():
            first, last = month_range(year, month)
            return first, last, f"{name.capitalize()} de {year}"
    match = re.search(r"\b(\d{1,2})/(\d{4})\b", str(text or ""))
    if match:
        month, year_value = int(match.group(1)), int(match.group(2))
        first, last = month_range(year_value, month)
        return first, last, f"{month:02d}/{year_value}"
    first, last = month_range(today.year, today.month)
    return first, last, f"{first.strftime('%m/%Y')}"


def extract_inline_date(text: str) -> tuple[str | None, str]:
    value = str(text or "")
    for pattern in [
        r"\b(hoje|ontem)\b",
        r"\b(?:em|no dia|dia)\s+(\d{1,2}/\d{1,2}/\d{4})\b",
        r"\b(?:em|no dia|dia)\s+(\d{1,2}/\d{1,2})\b",
        r"\b(\d{4}-\d{2}-\d{2})\b",
        r"\b(\d{1,2}/\d{1,2}/\d{4})\b",
        r"\b(\d{1,2}/\d{1,2})\b",
    ]:
        match = re.search(pattern, value, flags=re.I)
        if not match:
            continue
        parsed = parse_date(match.group(1))
        if not parsed:
            continue
        cleaned = (value[: match.start()] + " " + value[match.end() :]).strip()
        return parsed, re.sub(r"\s+", " ", cleaned)
    return None, value


def extract_money(text: str) -> tuple[Decimal | None, str]:
    pattern = r"(?i)(?:r\$\s*)?\d+(?:\.\d{3})*,\d{2}|(?:r\$\s*)?\d{1,3}(?:\.\d{3})+|(?:r\$\s*)?\d+\.\d{2}|(?:r\$\s*)?\d+"
    matches = list(re.finditer(pattern, text))
    if not matches:
        return None, text
    match = matches[0]
    value = money_to_decimal(match.group(0))
    cleaned = (text[: match.start()] + " " + text[match.end() :]).strip()
    return value, re.sub(r"\s+", " ", cleaned)


def extract_receipt_money(text: str) -> tuple[Decimal | None, str]:
    for pattern in [
        r"(?is)\bvalor\b\s*(r\$\s*\d+(?:\.\d{3})*,\d{2}|r\$\s*\d{1,3}(?:\.\d{3})+|r\$\s*\d+\.\d{2}|r\$\s*\d+|\d+(?:\.\d{3})*,\d{2}|\d{1,3}(?:\.\d{3})+|\d+\.\d{2})",
        r"(?is)(r\$\s*\d+(?:\.\d{3})*,\d{2}|r\$\s*\d{1,3}(?:\.\d{3})+|r\$\s*\d+\.\d{2}|r\$\s*\d+)",
    ]:
        match = re.search(pattern, text)
        if match:
            value = money_to_decimal(match.group(1))
            cleaned = (text[: match.start()] + " " + text[match.end() :]).strip()
            return value, re.sub(r"\s+", " ", cleaned)
    return extract_money(text)


def parse_key_values(text: str) -> tuple[dict[str, str], str]:
    values: dict[str, str] = {}
    rest: list[str] = []
    try:
        parts = shlex.split(text)
    except ValueError:
        parts = text.split()
    for part in parts:
        if "=" in part:
            key, value = part.split("=", 1)
            values[norm(key).replace(" ", "_")] = value.strip()
        else:
            rest.append(part)
    return values, " ".join(rest)


def parse_inline_updates(text: str) -> tuple[dict[str, str], str]:
    values: dict[str, str] = {}
    consumed: list[tuple[int, int]] = []
    field_pattern = r"(descri[cç][aã]o|desc|data|valor|categoria|conta|cart[aã]o|usuario|usu[aá]rio|tipo|parcelas|observa[cç][aã]o)"
    next_field = rf"(?=\s*(?:,|;|\be\b)?\s*{field_pattern}\s*(?::|=|\bpara\b)|$)"
    pattern = re.compile(rf"{field_pattern}\s*(?::|=|\bpara\b)\s*(.+?){next_field}", flags=re.I | re.S)
    for match in pattern.finditer(str(text or "")):
        raw_field = norm(match.group(1))
        field = EDITABLE_FIELDS.get(raw_field)
        if not field:
            continue
        value = re.sub(r"\s+", " ", match.group(2)).strip(" ,;:-")
        if not value:
            continue
        values[field] = value
        consumed.append((match.start(), match.end()))
    simple_pattern = re.compile(rf"\b(categoria|descri[cç][aã]o|desc)\s+([^,;.]+)", flags=re.I)
    for match in simple_pattern.finditer(str(text or "")):
        if any(match.start() >= start and match.end() <= end for start, end in consumed):
            continue
        raw_field = norm(match.group(1))
        field = EDITABLE_FIELDS.get(raw_field)
        if not field:
            continue
        value = re.sub(r"\s+", " ", match.group(2)).strip(" ,;:-")
        if not value:
            continue
        values[field] = value
        consumed.append((match.start(), match.end()))
    if not consumed:
        return {}, text
    rest_parts = []
    cursor = 0
    for start, end in consumed:
        rest_parts.append(str(text or "")[cursor:start])
        cursor = end
    rest_parts.append(str(text or "")[cursor:])
    rest = re.sub(r"^\s*(?:vou repetir|repetindo|ajuste|ajustar|alterar|corrigir)\s*:?\s*", "", "".join(rest_parts), flags=re.I)
    rest = re.sub(r"\s+", " ", rest).strip(" ,;:-")
    return values, rest


def strip_command(text: str) -> str:
    value = re.sub(r"^\s*/?lancar_familiar(?:@\w+)?\s*", "", str(text or ""), flags=re.I)
    value = re.sub(r"^\s*[^:\n]{1,120}\(\d{5,}\):\s*", "", value)
    value = re.sub(
        r"^\s*[^:\n]{1,120}:\s+(?=(?:/?lancar_familiar|paguei|pagamos|gastei|gastamos|comprei|compramos|recebi|recebemos)\b)",
        "",
        value,
        flags=re.I,
    )
    value = re.sub(r"^\s*finan[cç]as\s+(?:da\s+)?casa\s*", "", value, flags=re.I)
    value = re.sub(r"^\s*(?:lan[cç]ar|despesa|gasto|pagamento)\s+(?:familiar|da\s+casa|de\s+casa)?\s*", "", value, flags=re.I)
    return value.strip()


def looks_like_receipt(text: str) -> bool:
    clean = norm(text)
    return (
        ("comprovante" in clean and any(word in clean for word in ["transferencia", "pix", "pagamento"]))
        or ("id da transacao" in clean and "valor" in clean)
        or ("tipo de transferencia" in clean and "destino" in clean and "origem" in clean)
    )


def receipt_counterparty(text: str) -> str:
    match = re.search(r"(?:Destino\s+)?Nome\s+(.+?)(?:\n|Institui[cç][aã]o|$)", str(text or ""), flags=re.I | re.S)
    if not match:
        return ""
    return re.sub(r"\s+", " ", match.group(1)).strip(" -:")[:80]


def kv_pair(key: str, value: Any) -> str:
    return f"{key}={json.dumps(str(value), ensure_ascii=False)}"


def normalize_sms_merchant(raw: str) -> str:
    value = re.sub(r"\s+", " ", str(raw or "")).strip(" .,-")
    value = re.sub(r"^(?:MP|IFD)\*", "", value, flags=re.I)
    value = re.sub(r"[-\s]+\d{3,6}$", "", value).strip(" .,-")
    clean = norm(value)
    if "amazonmktplc" in clean or "amazon" in clean:
        return "Compra Amazon"
    if "apple com bill" in clean:
        return "Assinatura Apple"
    if "ifood club" in clean:
        return "IFood Club"
    if "pao de acucar" in clean:
        return "PAO DE ACUCAR"
    return value


def category_from_sms_description(description: str) -> str:
    clean = norm(description)
    if any(word in clean for word in ["subway", "marzuk"]):
        return "Alimentação - Restaurantes"
    if any(word in clean for word in ["pao de acucar", "varejao", "beef", "carnes", "acougue"]):
        return "Alimentação - Supermercado"
    if any(word in clean for word in ["assinatura apple", "apple com bill", "ifood club"]):
        return "Despesas Pessoais - Assinaturas"
    if "valdira" in clean:
        return "Casa & Manutenção - Diarista / Limpeza"
    return ""


def account_from_sms(text: str) -> str:
    clean = norm(text)
    if "visa" in clean:
        return "Cartão CAIXA Visa"
    if "master" in clean:
        return "Cartão CAIXA Master"
    if "elo" in clean:
        return "Cartão CAIXA Elo"
    return "CAIXA Matheus"


def parse_caixa_sms(text: str) -> str | None:
    raw = re.sub(r"\s+", " ", str(text or "")).strip()
    clean = norm(raw)
    if not (
        (clean.startswith("caixa") and any(marker in clean for marker in ["compra aprovada", "enviado"]))
        or clean.startswith("compra aprovada em")
    ):
        return None

    pix = re.search(
        r"CAIXA:\s*(?:MATHEUS,\s*)?enviado\s+R\$\s*([\d\.\s]+,\d{2})\s+para\s+(.+?),\s+via\s+PIX\s+em\s+(\d{1,2}/\d{1,2}/\d{4})",
        raw,
        flags=re.I,
    )
    if pix:
        amount, beneficiary, date_value = pix.groups()
        description = re.sub(r"\s+", " ", beneficiary).strip(" .,-")
        category = category_from_sms_description(description)
        parts = [
            kv_pair("valor", amount),
            kv_pair("data", date_value),
            kv_pair("conta", "CAIXA Matheus"),
            kv_pair("descricao", description),
        ]
        if category:
            parts.append(kv_pair("categoria", category))
        return " ".join(parts)

    card = re.search(
        r"Compra aprovada em\s+(.+?)\s*,?\s*R\$\s*([\d\.\s]+,\d{2})(?:\s+em\s+(\d{1,2})\s+vezes)?",
        raw,
        flags=re.I,
    )
    date_match = re.search(r"\b(\d{1,2}/\d{1,2}(?:/\d{4})?)\s*(?:às|as)\b", raw, flags=re.I)
    if not card or not date_match:
        return None
    merchant, amount, installments = card.groups()
    description = normalize_sms_merchant(merchant)
    category = category_from_sms_description(description)
    parts = [
        kv_pair("valor", amount),
        kv_pair("data", date_match.group(1)),
        kv_pair("conta", account_from_sms(raw)),
        kv_pair("descricao", description),
    ]
    if installments:
        parts.append(kv_pair("parcelas", installments))
    if category:
        parts.append(kv_pair("categoria", category))
    else:
        parts.append(description)
    return " ".join(parts)


def received_date_from_statement_text(text: str) -> date:
    today = relative_today()
    match = re.search(r"\bdia\s+(\d{1,2})/(\d{1,2})(?:/(\d{4}))?\b", str(text or ""), flags=re.I)
    if match:
        day, month, year = match.groups()
        return date(int(year or today.year), int(month), int(day))
    clean = norm(text)
    if "ontem" in clean:
        return today - timedelta(days=1)
    return today


def parse_credit_card_statement_sms(text: str) -> dict[str, Any] | None:
    raw = re.sub(r"\s+", " ", str(text or "")).strip()
    clean = norm(raw)
    if "valor total da fatura" not in clean or "vencimento" not in clean:
        return None
    if "caixa" not in clean or "cartao" not in clean:
        return None

    due_match = re.search(r"\bvencimento\s+em\s+(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", raw, flags=re.I)
    amount_match = re.search(r"\b(?:e|é|de)\s+R\$\s*([\d\.\s]+,\d{2})\b", raw, flags=re.I)
    if not due_match or not amount_match:
        return None

    received = received_date_from_statement_text(raw)
    due_day, due_month, due_year = due_match.groups()
    year = int(due_year) if due_year else received.year
    if year < 100:
        year += 2000
    due_date = date(year, int(due_month), int(due_day))
    if not due_year and due_date < received - timedelta(days=45):
        due_date = date(received.year + 1, int(due_month), int(due_day))

    brand = ""
    for candidate in ["elo", "visa", "master"]:
        if candidate in clean:
            brand = candidate
            break
    if not brand:
        return None
    account_name = account_from_sms(brand)
    final_match = re.search(r"\bfinal\s+(\d{4})\b", raw, flags=re.I)
    close_match = re.search(
        r"\b(?:corte|fechamento|fechou|fecha(?:da)?)\s+(?:em\s+|dia\s+)?(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b",
        raw,
        flags=re.I,
    )
    confirmed_close = False
    if close_match:
        close_day, close_month, close_year = close_match.groups()
        close_year_int = int(close_year) if close_year else received.year
        if close_year_int < 100:
            close_year_int += 2000
        period_end = date(close_year_int, int(close_month), int(close_day))
        confirmed_close = True
    else:
        period_end = received
    period_start = date.fromisoformat(add_months(period_end.isoformat(), -1)) + timedelta(days=1)
    competencia_mes = date(due_date.year, due_date.month, 1)
    amount = money_to_decimal(amount_match.group(1))
    if amount is None:
        return None
    return {
        "conta_nome": account_name,
        "cartao_final": final_match.group(1) if final_match else "",
        "valor_fatura": money_json(amount),
        "fatura_vencimento": due_date.isoformat(),
        "fatura_periodo_inicio": period_start.isoformat(),
        "fatura_periodo_fim": period_end.isoformat(),
        "competencia_mes": competencia_mes.isoformat(),
        "data_recebimento": received.isoformat(),
        "ciclo_fonte": "data_corte_confirmada" if confirmed_close else "sms_recebimento",
        "data_corte_confirmada": confirmed_close,
        "_source_text": raw,
    }


def parse_installments(text: str) -> tuple[int | None, str]:
    value = str(text or "")
    match = re.search(r"\b(?:em\s+)?(\d{1,2})\s*x\b", value, flags=re.I)
    if not match:
        match = re.search(r"\bparcelad[ao]\s+em\s+(\d{1,2})\b", value, flags=re.I)
    if not match:
        return None, value
    total = int(match.group(1))
    if total < 2 or total > 48:
        raise ValueError("Parcelamento precisa ter entre 2 e 48 parcelas.")
    cleaned = (value[: match.start()] + " " + value[match.end() :]).strip()
    return total, re.sub(r"\s+", " ", cleaned)


def forbidden_reason(text: str) -> str | None:
    clean = norm(text)
    for pattern in FORBIDDEN_PATTERNS:
        if re.search(pattern, clean, flags=re.I):
            return "Esse fluxo só permite cadastrar ou editar lançamentos familiares após confirmação explícita. Não tenho permissão para apagar, executar SQL, importar dados em lote ou editar por pedido livre sem confirmação."
    return None


def intent_to_message(raw: str) -> str:
    try:
        intent = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Intent JSON inválido: {exc}") from exc
    if not isinstance(intent, dict):
        raise ValueError("Intent precisa ser um objeto JSON.")
    extra = sorted(set(intent) - ALLOWED_INTENT_KEYS)
    if extra:
        raise ValueError("Intent contém campos não permitidos: " + ", ".join(extra))
    action = str(intent.get("action") or "criar_lancamento_familiar")
    if action not in ALLOWED_INTENT_ACTIONS:
        raise ValueError(f"Intent action não permitida: {action}")
    denied = forbidden_reason(json.dumps(intent, ensure_ascii=False))
    if denied:
        raise ValueError(denied)

    mapping = [
        ("data", "data"),
        ("categoria", "categoria"),
        ("valor", "valor"),
        ("descricao", "descricao"),
        ("usuario", "usuario"),
        ("usuario_lancamento", "usuario"),
        ("conta", "conta"),
        ("tipo", "tipo"),
        ("parcelas", "parcelas"),
        ("comprovante_url", "comprovante_url"),
        ("observacao", "observacao"),
    ]
    parts = []
    for source, target in mapping:
        value = intent.get(source)
        if value in (None, ""):
            continue
        parts.append(f'{target}="{value}"')
    return " ".join(parts)


class Supabase:
    def __init__(self) -> None:
        load_runtime_env()
        self.url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        self.key = os.environ.get("SUPABASE_SERVICE_KEY", "")
        if not self.url or not self.key:
            raise SystemExit(json.dumps({"action": "error", "message": "Supabase não configurado."}, ensure_ascii=False))

    @property
    def headers(self) -> dict[str, str]:
        return {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }

    def get(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        response = requests.get(f"{self.url}/rest/v1/{table}", headers=self.headers, params=params, timeout=20)
        if not response.ok:
            raise RuntimeError(f"Falha ao consultar {table}: {response.status_code} {response.text[:300]}")
        return response.json()

    def post(self, table: str, payload: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]]:
        headers = {**self.headers, "Prefer": "return=representation"}
        response = requests.post(f"{self.url}/rest/v1/{table}", headers=headers, json=payload, timeout=20)
        if not response.ok:
            raise RuntimeError(f"Falha ao inserir em {table}: {response.status_code} {response.text[:500]}")
        data = response.json()
        return data if isinstance(data, list) else [data]

    def patch(self, table: str, payload: dict[str, Any], params: dict[str, str]) -> list[dict[str, Any]]:
        headers = {**self.headers, "Prefer": "return=representation"}
        response = requests.patch(f"{self.url}/rest/v1/{table}", headers=headers, params=params, json=payload, timeout=20)
        if not response.ok:
            raise RuntimeError(f"Falha ao atualizar {table}: {response.status_code} {response.text[:500]}")
        data = response.json()
        return data if isinstance(data, list) else [data]

    def delete(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        headers = {**self.headers, "Prefer": "return=representation"}
        response = requests.delete(f"{self.url}/rest/v1/{table}", headers=headers, params=params, timeout=20)
        if not response.ok:
            raise RuntimeError(f"Falha ao remover de {table}: {response.status_code} {response.text[:500]}")
        data = response.json()
        return data if isinstance(data, list) else [data]


@dataclass
class Catalog:
    usuarios: list[dict[str, Any]]
    contas: list[dict[str, Any]]
    grupos: list[dict[str, Any]]
    categorias: list[dict[str, Any]]


def load_catalog(db: Supabase | None = None, *, offline: bool = False) -> Catalog:
    if offline:
        return Catalog(DEFAULT_USERS, DEFAULT_ACCOUNTS, DEFAULT_GROUPS, DEFAULT_CATEGORIES)
    if db is None:
        db = Supabase()
    try:
        if CATALOG_CACHE_PATH.exists():
            cached = json.loads(CATALOG_CACHE_PATH.read_text(encoding="utf-8"))
            age = datetime.now().timestamp() - float(cached.get("created_at") or 0)
            data = cached.get("data") if age <= CATALOG_CACHE_TTL_SECONDS else None
            if isinstance(data, dict):
                return Catalog(
                    usuarios=list(data.get("usuarios") or []),
                    contas=list(data.get("contas") or []),
                    grupos=list(data.get("grupos") or []),
                    categorias=list(data.get("categorias") or []),
                )
    except Exception:
        pass
    catalog = Catalog(
        usuarios=db.get("fam_usuarios", {"select": "id,nome,telegram_user_id,ativo", "ativo": "eq.true", "order": "id.asc"}),
        contas=db.get("fam_contas", {"select": "id,nome,tipo,titular_usuario_id,ativa", "ativa": "eq.true", "order": "id.asc"}),
        grupos=db.get("fam_categoria_grupos", {"select": "id,nome,ordem,ativo", "ativo": "eq.true", "order": "ordem.asc"}),
        categorias=db.get("fam_categorias", {"select": "id,grupo_id,nome,tipo_padrao,palavras_chave,ativa", "ativa": "eq.true", "order": "id.asc"}),
    )
    try:
        CATALOG_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CATALOG_CACHE_PATH.write_text(
            json.dumps(
                {
                    "created_at": datetime.now().timestamp(),
                    "data": {
                        "usuarios": catalog.usuarios,
                        "contas": catalog.contas,
                        "grupos": catalog.grupos,
                        "categorias": catalog.categorias,
                    },
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
    except Exception:
        pass
    return catalog


def group_name(catalog: Catalog, group_id: Any) -> str:
    for group in catalog.grupos:
        if int(group.get("id") or 0) == int(group_id or 0):
            return str(group.get("nome") or "")
    return ""


def category_label(category: dict[str, Any], catalog: Catalog) -> str:
    group = group_name(catalog, category.get("grupo_id"))
    return f"{group} - {category.get('nome')}" if group else str(category.get("nome") or "")


def score_match(query: str, target: str) -> int:
    q = norm(query)
    t = norm(target)
    if not q or not t:
        return 0
    if q == t:
        return 100
    if t in q:
        return 95
    if q in t:
        return 80 + min(len(q), 15)
    query_words = [w for w in q.split() if len(w) > 2]
    target_words = [w for w in t.split() if len(w) > 2]
    if not query_words or not target_words:
        return 0
    query_hits = sum(1 for w in query_words if w in t)
    target_hits = sum(1 for w in target_words if w in q)
    return max(int(60 * query_hits / len(query_words)) if query_hits else 0, int(70 * target_hits / len(target_words)) if target_hits else 0)


def best_matches(query: str, rows: list[dict[str, Any]], label_keys: list[str], min_score: int = 50) -> list[dict[str, Any]]:
    ranked = []
    for row in rows:
        score = max(score_match(query, str(row.get(key) or "")) for key in label_keys)
        if score >= min_score:
            ranked.append({**row, "_score": score})
    return sorted(ranked, key=lambda r: (-int(r["_score"]), str(r.get(label_keys[0]) or "")))[:6]


def ranked_category_rows(raw_ids: Any, catalog: Catalog, limit: int) -> list[dict[str, Any]]:
    if not isinstance(raw_ids, list):
        return []
    by_id = {int(category.get("id") or 0): category for category in catalog.categorias}
    ranked: list[dict[str, Any]] = []
    for raw_id in raw_ids[:limit]:
        try:
            category_id = int(raw_id)
        except (TypeError, ValueError):
            continue
        category = by_id.get(category_id)
        if category and not any(int(item.get("id") or 0) == category_id for item in ranked):
            ranked.append({**category, "_score": 130})
    return ranked


def category_ai_cache_key(text: str) -> str:
    clean = norm(text)
    clean = re.sub(
        r"\b(?:r|rs|valor|data|conta|descricao|parcelas|vezes|em|as|se|final|visa|master|elo|virtual|caixa|compra|aprovada|desconhecer|envie|cancelar|cartao|cartao)\b",
        " ",
        clean,
    )
    clean = re.sub(r"\bbl\d+\b", " ", clean)
    clean = re.sub(r"\b\d+\b", " ", clean)
    return re.sub(r"\s+", " ", clean).strip()[:240]


def load_category_ai_cache() -> dict[str, Any]:
    try:
        if not CATEGORY_AI_CACHE_PATH.exists():
            return {}
        data = json.loads(CATEGORY_AI_CACHE_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_category_ai_cache(cache: dict[str, Any]) -> None:
    try:
        CATEGORY_AI_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CATEGORY_AI_CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


def cached_category_ai_ranking(text: str, catalog: Catalog, limit: int) -> list[dict[str, Any]]:
    key = category_ai_cache_key(text)
    if not key:
        return []
    cache = load_category_ai_cache()
    item = cache.get(key)
    if not isinstance(item, dict):
        return []
    if str(item.get("model") or "") != CATEGORY_GEMINI_MODEL:
        return []
    try:
        age = datetime.now().timestamp() - float(item.get("created_at") or 0)
    except (TypeError, ValueError):
        return []
    if age > CATEGORY_AI_CACHE_TTL_SECONDS:
        return []
    return ranked_category_rows(item.get("category_ids"), catalog, limit)


def store_category_ai_ranking(text: str, ranked: list[dict[str, Any]]) -> None:
    key = category_ai_cache_key(text)
    if not key or not ranked:
        return
    cache = load_category_ai_cache()
    cache[key] = {
        "created_at": datetime.now().timestamp(),
        "model": CATEGORY_GEMINI_MODEL,
        "category_ids": [int(item.get("id") or 0) for item in ranked if item.get("id")],
    }
    save_category_ai_cache(cache)


def category_ai_payload(text: str, catalog: Catalog) -> dict[str, Any]:
    categories = [
        {
            "id": int(category.get("id") or 0),
            "label": category_label(category, catalog),
            "tipo": category.get("tipo_padrao") or "",
            "palavras_chave": category.get("palavras_chave") or [],
        }
        for category in catalog.categorias
    ]
    return {
        "task": "Rank likely Brazilian family-finance category IDs for the text. Use semantic intent and nearby meaning, not only exact keywords.",
        "rules": [
            "Return JSON only.",
            "Use only IDs from categories.",
            "If the user names a group but not a subcategory, rank categories from that group.",
            "If the text mentions a merchant or service, infer the closest everyday category.",
            "Do not invent categories.",
        ],
        "text": str(text or "")[:1000],
        "categories": categories,
        "output": {"category_ids": ["integer"], "confidence": "0..1", "reason": "short"},
    }


def set_category_ai_notice(message: str) -> None:
    global CATEGORY_AI_NOTICE
    CATEGORY_AI_NOTICE = message


def category_ai_failure_notice(detail: str = "") -> str:
    suffix = f" ({detail})" if detail else ""
    return f"⚠️ IA de categorias indisponível no Gemini{suffix}. Atualize a cota ou o modelo configurado antes de confiar nas sugestões automáticas."


def ai_category_ranking_gemini(payload: dict[str, Any], catalog: Catalog, limit: int) -> list[dict[str, Any]]:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip() or os.environ.get("GOOGLE_API_KEY", "").strip()
    if not api_key:
        set_category_ai_notice(category_ai_failure_notice("chave ausente"))
        return []
    try:
        response = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{CATEGORY_GEMINI_MODEL}:generateContent",
            params={"key": api_key},
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"role": "user", "parts": [{"text": json.dumps(payload, ensure_ascii=False)}]}],
                "generationConfig": {
                    "temperature": 0,
                    "maxOutputTokens": 1024,
                    "responseMimeType": "application/json",
                    "thinkingConfig": {"thinkingBudget": 0},
                },
            },
            timeout=8,
        )
        if not response.ok:
            detail = ""
            try:
                error = response.json().get("error") or {}
                detail = str(error.get("code") or response.status_code)
            except Exception:
                detail = str(response.status_code)
            set_category_ai_notice(category_ai_failure_notice(f"HTTP {detail}"))
            return []
        parts = (((response.json().get("candidates") or [{}])[0].get("content") or {}).get("parts") or [])
        content = str((parts[0] if parts else {}).get("text") or "").strip()
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
        data = json.loads(content)
    except Exception:
        set_category_ai_notice(category_ai_failure_notice("falha de resposta"))
        return []
    return ranked_category_rows(data.get("category_ids") if isinstance(data, dict) else [], catalog, limit)


def ai_category_ranking(text: str, catalog: Catalog, limit: int = 6) -> list[dict[str, Any]]:
    global CATEGORY_AI_NOTICE
    CATEGORY_AI_NOTICE = ""
    if os.environ.get("FINANCEIRO_FAMILIAR_DISABLE_CATEGORY_AI") == "1":
        return []
    cached = cached_category_ai_ranking(text, catalog, limit)
    if cached:
        return cached
    payload = category_ai_payload(text, catalog)
    ranked = ai_category_ranking_gemini(payload, catalog, limit)
    store_category_ai_ranking(text, ranked)
    return ranked


def choose_by_reply(text: str, candidates: list[dict[str, Any]], label_keys: list[str]) -> dict[str, Any] | None:
    clean = norm(text)
    if clean.isdigit():
        idx = int(clean) - 1
        if 0 <= idx < len(candidates):
            return candidates[idx]
    option_match = re.match(r"^\s*(\d{1,2})\s*[-.)]\s*\S+", str(text or ""))
    if option_match:
        idx = int(option_match.group(1)) - 1
        if 0 <= idx < len(candidates):
            return candidates[idx]
    for row in candidates:
        for key in label_keys:
            if key in row and score_match(clean, str(row.get(key) or "")) >= 75:
                return row
    return None


def option_reply_detail(text: str) -> str:
    match = re.match(r"^\s*\d{1,2}\s*[-.)]\s*(.+?)\s*$", str(text or ""))
    return match.group(1).strip() if match else ""


def resolve_user(text: str, catalog: Catalog) -> dict[str, Any] | None:
    matches = best_matches(text, catalog.usuarios, ["nome"], min_score=60)
    return matches[0] if len(matches) == 1 or (matches and int(matches[0]["_score"]) >= 90) else None


def resolve_account(text: str, catalog: Catalog) -> dict[str, Any] | None:
    clean = norm(text)
    aliases = [
        (("visa bb", "bb visa", "cartao bb visa", "cartao visa bb", "cartao do bb", "cartao banco do brasil"), "Cartão BB Visa Carol"),
        (("visa da mae", "visa mae", "cartao da mae", "cartao mae", "visa caixa carol", "visa da caixa carol", "cartao caixa carol", "cartao da caixa da mae", "visa da caixa da mae"), "Cartão CAIXA Visa (mãe Carol)"),
        (("banco do brasil", "conta banco do brasil", "conta do bb", "conta bb", "no bb", "na bb", "bb"), "Banco do Brasil Carol"),
        (("no visa", "na visa", "visa", "cartao visa", "cartao caixa visa"), "Cartão CAIXA Visa"),
        (("no master", "na master", "master", "mastercard", "cartao master", "cartao caixa master"), "Cartão CAIXA Master"),
        (("no elo", "na elo", "elo", "cartao elo", "cartao caixa elo"), "Cartão CAIXA Elo"),
        (("na caixa", "no caixa", "conta caixa", "conta da caixa", "conta do caixa", "caixa", "debito", "conta corrente"), "CAIXA Matheus"),
    ]
    for needles, account in aliases:
        if any(needle in clean for needle in needles):
            matches = best_matches(account, catalog.contas, ["nome"], min_score=80)
            if matches:
                return matches[0]
    matches = best_matches(text, catalog.contas, ["nome", "tipo"], min_score=60)
    return matches[0] if len(matches) == 1 or (matches and int(matches[0]["_score"]) >= 90) else None


def deterministic_category_best(text: str, catalog: Catalog) -> tuple[int, dict[str, Any] | None]:
    clean = norm(text)
    best: tuple[int, dict[str, Any] | None] = (0, None)
    for category in catalog.categorias:
        label = category_label(category, catalog)
        if label == "Despesas Pessoais - Eletrônicos / acessórios" and phone_bill_context(clean):
            continue
        score = max(score_match(text, label), score_match(text, str(category.get("nome") or "")))
        for keyword in category.get("palavras_chave") or []:
            keyword_norm = norm(keyword)
            if keyword_norm and keyword_norm in clean:
                score = max(score, 98)
            else:
                score = max(score, score_match(text, str(keyword)))
        if score > best[0]:
            best = (score, category)
    return best


def resolve_category(text: str, catalog: Catalog) -> dict[str, Any] | None:
    clean = norm(text)
    group = group_hint(text, catalog)
    group_clean = norm(group.get("nome")) if group else ""
    if group and not category_specific_hint(text) and (
        clean == group_clean or (group_clean not in clean and len(clean.split()) <= 3 and score_match(clean, group_clean) >= 88)
    ):
        return None
    child_hint = child_category_hint(clean, catalog)
    if child_hint:
        return child_hint
    parking_hint = category_by_group_and_name(catalog, "Mobilidade", "Estacionamento / pedágio")
    if parking_hint and any(word in clean for word in ["estacionamento", "pedagio", "manobrista", "valet"]):
        return parking_hint
    house_utility_hint = category_by_group_and_name(catalog, "Casa & Manutenção", "Utensílios")
    if house_utility_hint and any(word in clean for word in ["utensilio", "utensilios", "utensilhos", "utilidade", "utilidades", "inovautilidades"]):
        return house_utility_hint
    real_estate_income_hint = category_by_group_and_name(catalog, "Receitas", "Retirada (imóveis)")
    if real_estate_income_hint and any(word in clean for word in ["retirada imoveis", "retirada de imoveis", "repasse imoveis", "repasse de imoveis"]):
        return real_estate_income_hint
    real_estate_reimburse_hint = category_by_group_and_name(catalog, "A recuperar", "Imóveis")
    if real_estate_reimburse_hint and any(word in clean for word in ["a recuperar imoveis", "a restituir", "restituir", "restituicao", "imoveis a restituir"]):
        return real_estate_reimburse_hint
    house_tax_hint = category_by_group_and_name(catalog, "Casa & Manutenção", "IPTU / taxas")
    if house_tax_hint and any(word in clean for word in ["iptu", "taxa de lixo", "tributo municipal"]):
        return house_tax_hint
    furniture_hint = category_by_group_and_name(catalog, "Casa & Manutenção", "Móveis / decoração")
    if furniture_hint and "imoveis" not in clean and any(word in clean for word in ["movel", "moveis", "decoracao", "cadeira", "mesa", "sofa", "estante", "rack"]):
        return furniture_hint
    phone_hint = category_by_group_and_name(catalog, "Despesas Pessoais", "Telefone / celular")
    if phone_hint and any(word in clean for word in ["fatura celular", "conta celular", "plano celular", "celular", "telefone", "vivo", "claro", "tim"]):
        return phone_hint
    electronics_hint = category_by_group_and_name(catalog, "Despesas Pessoais", "Eletrônicos / acessórios")
    if electronics_hint and any(word in clean for word in ["eletronico", "eletronicos", "acessorio", "acessorios", "ipad", "tablet", "fone", "carregador", "capa ipad", "capa celular"]):
        return electronics_hint
    restaurant_hint = category_by_group_and_name(catalog, "Alimentação", "Restaurantes")
    if restaurant_hint and any(word in clean for word in ["lanche", "almoco", "jantar", "restaurante", "refeicao", "cafe"]):
        return restaurant_hint
    project_hint = project_category_hint(clean, catalog)
    if project_hint:
        return project_hint
    best = deterministic_category_best(text, catalog)
    if best[0] >= 90:
        return best[1]
    ai_ranked = ai_category_ranking(text, catalog, limit=1)
    if ai_ranked:
        return ai_ranked[0]
    return best[1] if best[0] >= 60 else None


def category_by_group_and_name(catalog: Catalog, group: str, name: str) -> dict[str, Any] | None:
    for category in catalog.categorias:
        if group_name(catalog, category.get("grupo_id")) == group and str(category.get("nome") or "") == name:
            return category
    return None


def group_hint(text: str, catalog: Catalog) -> dict[str, Any] | None:
    clean = norm(text)
    if not clean:
        return None
    word_count = len(clean.split())
    for group in catalog.grupos:
        group_clean = norm(group.get("nome"))
        if clean == group_clean or group_clean in clean:
            return group
        if word_count <= 3 and score_match(clean, group_clean) >= 88:
            return group
    return None


def categories_for_group(group: dict[str, Any], catalog: Catalog, limit: int = 12) -> list[dict[str, Any]]:
    group_id = int(group.get("id") or 0)
    rows = [category for category in catalog.categorias if int(category.get("grupo_id") or 0) == group_id]
    return rows[:limit]


def category_specific_hint(text: str) -> bool:
    clean = norm(text)
    return any(
        word in clean
        for word in [
            "manobrista",
            "valet",
            "estacionamento",
            "pedagio",
            "combustivel",
            "gasolina",
            "alcool",
            "etanol",
            "lavagem",
            "lava car",
            "ipva",
            "licenciamento",
            "uber",
            "taxi",
            "99",
            "seguro",
            "financiamento",
            "prestacao",
            "recarga",
            "oficina",
            "revisao",
            "pneu",
            "a restituir",
            "restituir",
            "restituicao",
        ]
    )


def child_category_hint(clean_text: str, catalog: Catalog) -> dict[str, Any] | None:
    child = ""
    if "lucas" in clean_text:
        child = "Lucas"
    elif "thiago" in clean_text:
        child = "Thiago"
    if not child:
        return None

    if any(word in clean_text for word in ["farmacia", "remedio", "medicamento", "medico", "consulta", "exame", "saude"]):
        category_name = "Saúde"
    elif any(word in clean_text for word in ["escola", "mensalidade", "colegio"]):
        category_name = "Escola" if child == "Lucas" else "Educação"
    elif any(word in clean_text for word in ["material escolar", "livro", "caderno", "uniforme"]):
        category_name = "Material escolar" if child == "Lucas" else "Educação"
    elif any(word in clean_text for word in ["baba", "babysitter"]):
        category_name = "Babá" if child == "Lucas" else "Extras"
    elif any(word in clean_text for word in ["atividade", "natacao", "futebol", "aula"]):
        category_name = "Atividades"
    elif any(word in clean_text for word in ["presente", "brinquedo", "lazer", "passeio"]):
        category_name = "Lazer / presentes"
    else:
        category_name = "Extras"

    for category in catalog.categorias:
        if group_name(catalog, category.get("grupo_id")) == child and str(category.get("nome") or "") == category_name:
            return category
    return None


def project_category_hint(clean_text: str, catalog: Catalog) -> dict[str, Any] | None:
    wedding_words = {
        "alianca",
        "aliancas",
        "anel",
        "aneis",
        "joalheria",
        "casamento",
        "noivado",
        "cerimonia",
        "buffet",
        "vestido",
        "decoracao",
        "decorador",
        "fotografo",
        "foto",
        "filmagem",
        "convite",
        "lua de mel",
    }
    if not any(word in clean_text for word in wedding_words):
        return None
    for category in catalog.categorias:
        if group_name(catalog, category.get("grupo_id")) == "Projetos" and str(category.get("nome") or "") == "Casamento":
            return category
    return None


def suggested_categories(text: str, catalog: Catalog, limit: int = 6) -> list[dict[str, Any]]:
    clean = norm(text)
    child_hint = child_category_hint(clean, catalog)
    if child_hint:
        return [child_hint]
    priority_hints = []
    group = group_hint(text, catalog)
    if group:
        priority_hints.extend(categories_for_group(group, catalog, limit=limit))
    parking_hint = category_by_group_and_name(catalog, "Mobilidade", "Estacionamento / pedágio")
    if parking_hint and any(word in clean for word in ["estacionamento", "pedagio", "manobrista", "valet"]):
        priority_hints.append(parking_hint)
    house_utility_hint = category_by_group_and_name(catalog, "Casa & Manutenção", "Utensílios")
    if house_utility_hint and any(word in clean for word in ["utensilio", "utensilios", "utensilhos", "utilidade", "utilidades", "inovautilidades"]):
        priority_hints.append(house_utility_hint)
    real_estate_income_hint = category_by_group_and_name(catalog, "Receitas", "Retirada (imóveis)")
    if real_estate_income_hint and any(word in clean for word in ["retirada imoveis", "retirada de imoveis", "repasse imoveis", "repasse de imoveis"]):
        priority_hints.append(real_estate_income_hint)
    real_estate_reimburse_hint = category_by_group_and_name(catalog, "A recuperar", "Imóveis")
    if real_estate_reimburse_hint and any(word in clean for word in ["a recuperar imoveis", "a restituir", "restituir", "restituicao", "imoveis a restituir"]):
        priority_hints.append(real_estate_reimburse_hint)
    house_tax_hint = category_by_group_and_name(catalog, "Casa & Manutenção", "IPTU / taxas")
    if house_tax_hint and any(word in clean for word in ["iptu", "taxa de lixo", "tributo municipal"]):
        priority_hints.append(house_tax_hint)
    furniture_hint = category_by_group_and_name(catalog, "Casa & Manutenção", "Móveis / decoração")
    if furniture_hint and "imoveis" not in clean and any(word in clean for word in ["movel", "moveis", "decoracao", "cadeira", "mesa", "sofa", "estante", "rack"]):
        priority_hints.append(furniture_hint)
    phone_hint = category_by_group_and_name(catalog, "Despesas Pessoais", "Telefone / celular")
    if phone_hint and any(word in clean for word in ["fatura celular", "conta celular", "plano celular", "celular", "telefone", "vivo", "claro", "tim"]):
        priority_hints.append(phone_hint)
    electronics_hint = category_by_group_and_name(catalog, "Despesas Pessoais", "Eletrônicos / acessórios")
    if electronics_hint and any(word in clean for word in ["amazon", "amazonmktplc", "eletronico", "eletronicos", "acessorio", "acessorios", "ipad", "tablet", "fone", "carregador", "capa ipad", "capa celular"]):
        priority_hints.append(electronics_hint)
    restaurant_hint = category_by_group_and_name(catalog, "Alimentação", "Restaurantes")
    if restaurant_hint and any(word in clean for word in ["lanche", "almoco", "jantar", "restaurante", "refeicao", "cafe"]):
        priority_hints.append(restaurant_hint)
    project_hint = project_category_hint(clean, catalog)
    if project_hint:
        priority_hints.append(project_hint)
    scored = []
    for category in catalog.categorias:
        label = category_label(category, catalog)
        if label == "Despesas Pessoais - Eletrônicos / acessórios" and phone_bill_context(clean):
            continue
        score = max(score_match(text, label), score_match(text, str(category.get("nome") or "")))
        for keyword in category.get("palavras_chave") or []:
            keyword_norm = norm(keyword)
            if keyword_norm and keyword_norm in clean:
                score = max(score, 98)
            else:
                score = max(score, score_match(text, str(keyword)))
        if score >= 45:
            scored.append({**category, "_score": score})
    local_is_confident = bool(priority_hints) or any(int(item.get("_score") or 0) >= 90 for item in scored)
    if not local_is_confident:
        ai_ranked = ai_category_ranking(text, catalog, limit=limit)
        for hint in ai_ranked:
            if not any(int(c.get("id") or 0) == int(hint.get("id") or 0) for c in priority_hints):
                priority_hints.append(hint)
    for hint in priority_hints:
        if not any(int(c.get("id") or 0) == int(hint.get("id") or 0) for c in scored):
            scored.append({**hint, "_score": 120})
        else:
            scored = [
                {**c, "_score": max(int(c.get("_score") or 0), 120)}
                if int(c.get("id") or 0) == int(hint.get("id") or 0)
                else c
                for c in scored
            ]
    if not scored:
        fallback_labels = [
            "Despesas Pessoais - Telefone / celular",
            "Despesas Pessoais - Eletrônicos / acessórios",
            "Despesas Pessoais - Outros pessoais",
            "Casa & Manutenção - Utensílios",
            "Casa & Manutenção - Móveis / decoração",
            "Casa & Manutenção - Manutenção",
            "Alimentação - Supermercado",
            "Projetos - Casamento",
        ]
        by_label = {category_label(c, catalog): c for c in catalog.categorias}
        scored = [{**by_label[label], "_score": 80 - idx} for idx, label in enumerate(fallback_labels) if label in by_label]
    return sorted(scored, key=lambda c: (-int(c.get("_score") or 0), category_label(c, catalog)))[:limit]


def phone_bill_context(clean_text: str) -> bool:
    if any(word in clean_text for word in ["fatura celular", "conta celular", "plano celular", "pagamento celular", "telefone", "vivo", "claro", "tim"]):
        return True
    if "celular" not in clean_text:
        return False
    return not any(word in clean_text for word in ["capa celular", "carregador", "fone", "acessorio", "acessorios", "iphone", "smartphone", "comprar", "comprei", "compra"])


def format_options(rows: list[dict[str, Any]], kind: str, catalog: Catalog) -> str:
    lines = []
    for i, row in enumerate(rows, 1):
        if kind == "categoria":
            lines.append(f"{i}. {category_label(row, catalog)}")
        elif kind == "conta":
            lines.append(f"{i}. {row.get('nome')}")
        elif kind == "usuario":
            lines.append(f"{i}. {row.get('nome')}")
    return "\n".join(lines)


def format_description(text: str) -> str:
    raw = re.sub(r"\s+", " ", str(text or "")).strip(" -")
    merchant_match = re.search(r"\bcompra aprovada em\s+(.+?)(?:,|\s+r\$|\s+\d{1,2}/\d{1,2}|$)", raw, flags=re.I)
    if merchant_match:
        merchant_description = normalize_sms_merchant(merchant_match.group(1))
        if merchant_description:
            return format_description(merchant_description)
    raw = re.sub(r"\b(?:categoria|descri[cç][aã]o)\s*(?::|=|\bpara\b)\s*", " ", raw, flags=re.I)
    raw = re.sub(r"\b(?:hoje|ontem)\b", " ", raw, flags=re.I)
    raw = re.sub(
        r"\b(?:paguei|paguem|pagamos|pago|pagar|gastei|gastamos|comprei|compramos|lan[cç]ar|despesa|gasto|pagamento|recebi|recebemos)\b",
        " ",
        raw,
        flags=re.I,
    )
    raw = re.sub(
        r"\b(?:usando\s+)?(?:a\s+)?conta\s+(?:da\s+|do\s+)?caixa\b|\b(?:da|do|na|no|pela|pelo)\s+conta\s+(?:da\s+|do\s+)?caixa\b",
        " ",
        raw,
        flags=re.I,
    )
    raw = re.sub(
        r"\b(?:no|na|pela|pelo|usando)\s+(?:bb|banco\s+do\s+brasil)\b|\bconta\s+(?:do\s+)?(?:bb|banco\s+do\s+brasil)\b",
        " ",
        raw,
        flags=re.I,
    )
    raw = re.sub(
        r"\b(?:no|na|pelo|pela|usando)\s+visa\s+(?:bb|da\s+mae|da\s+mãe|caixa\s+carol)\b|\bcart[aã]o\s+(?:bb|da\s+mae|da\s+mãe|caixa\s+carol)\b",
        " ",
        raw,
        flags=re.I,
    )
    raw = re.sub(r"\b(?:no|na|nos|nas|em|pelo|pela|usando)\s+(?:visa|master(?:card)?|elo|caixa|cart[aã]o)\b", " ", raw, flags=re.I)
    raw = re.sub(
        r"(?i)(?:r\$\s*)?\d+(?:\.\d{3})*,\d{2}|(?:r\$\s*)?\d+\.\d{2}|(?:r\$\s*)?\d+",
        " ",
        raw,
    )
    raw = re.sub(r"\s+", " ", raw).strip(" -.,:")
    while True:
        cleaned = re.sub(r"^(?:referente\s+a|referente|para|com|em|no|na|nos|nas|de|do|da|dos|das|ao|aos|a|as|o|os)\s+", "", raw, flags=re.I).strip(" -.,:")
        if cleaned == raw:
            break
        raw = cleaned
    if not raw:
        return "Lancamento familiar"
    special_descriptions = {
        "pao de acucar": "PAO DE ACUCAR",
        "ifood club": "IFood Club",
    }
    special = special_descriptions.get(norm(raw))
    if special:
        return special
    lower_words = {"a", "as", "com", "da", "das", "de", "do", "dos", "e", "em", "na", "no", "para", "por"}
    acronyms = {"iptu": "IPTU", "ipva": "IPVA", "irpf": "IRPF", "pix": "Pix", "uber": "Uber", "ipad": "iPad"}
    words = []
    for i, word in enumerate(raw.split()):
        clean = norm(word)
        if clean in acronyms:
            words.append(acronyms[clean])
        elif i > 0 and clean in lower_words:
            words.append(word.lower())
        else:
            words.append(word[:1].upper() + word[1:].lower())
    return " ".join(words)


def split_installments(total: Decimal, count: int) -> list[Decimal]:
    base = (total / Decimal(count)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    values = [base for _ in range(count)]
    values[-1] = (total - sum(values[:-1])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return values


def rebuild_entries(draft: dict[str, Any]) -> None:
    if not all(draft.get(key) not in (None, "") for key in ["data", "valor", "descricao", "id_usuario", "id_conta", "id_categoria"]):
        draft.pop("entries", None)
        return
    count = int(draft.get("parcelas") or 1)
    total = money_to_decimal(draft.get("valor")) or Decimal("0.00")
    group_id = draft.get("parcelamento_grupo_id") or (str(uuid.uuid4()) if count > 1 else None)
    if count > 1:
        draft["parcelamento_grupo_id"] = group_id
    else:
        draft.pop("parcelamento_grupo_id", None)
    values = split_installments(total, count)
    entries = []
    for idx, amount in enumerate(values, 1):
        suffix = f" {idx:02d}/{count:02d}" if count > 1 else ""
        entries.append(
            {
                "data": add_months(str(draft["data"]), idx - 1),
                "valor": money_json(amount),
                "tipo": draft.get("tipo") or "variavel",
                "descricao": f"{draft.get('descricao')}{suffix}",
                "usuario_lancamento_id": draft["id_usuario"],
                "conta_id": draft["id_conta"],
                "categoria_id": draft["id_categoria"],
                "comprovante_url": draft.get("comprovante_url"),
                "observacao": draft.get("observacao"),
                "parcelamento_grupo_id": group_id,
                "parcela_atual": idx if count > 1 else None,
                "parcelas_total": count if count > 1 else None,
                "created_by_usuario_id": draft.get("created_by_usuario_id") or draft["id_usuario"],
                "ativo": True,
            }
        )
    draft["entries"] = entries


def same_day_value_warnings(db: Supabase | None, draft: dict[str, Any]) -> list[str]:
    if db is None:
        return []
    entries = draft.get("entries")
    if not isinstance(entries, list):
        return []
    seen_queries: set[tuple[str, str]] = set()
    seen_ids: set[int] = set()
    warnings: list[str] = []
    for entry in entries:
        entry_date = str(entry.get("data") or "")
        entry_value = money_json(entry.get("valor"))
        if not entry_date or not entry_value:
            continue
        query_key = (entry_date, entry_value)
        if query_key in seen_queries:
            continue
        seen_queries.add(query_key)
        matches = db.get(
            "fam_lancamentos",
            {
                "select": "id,data,valor,descricao",
                "ativo": "eq.true",
                "data": f"eq.{entry_date}",
                "valor": f"eq.{entry_value}",
                "order": "id.asc",
                "limit": "5",
            },
        )
        for match in matches:
            try:
                match_id = int(match.get("id") or 0)
            except Exception:
                match_id = 0
            if match_id and match_id in seen_ids:
                continue
            if match_id:
                seen_ids.add(match_id)
            warnings.append(
                f"⚠️ #{match.get('id')} | {match.get('data')} | {brl(match.get('valor'))} | {match.get('descricao')}"
            )
    return warnings[:5]


def draft_summary(draft: dict[str, Any]) -> str:
    count = int(draft.get("parcelas") or 1)
    lines = []
    duplicate_warnings = draft.get("_duplicate_warnings") or []
    if duplicate_warnings:
        lines.extend(
            [
                "🚨 ATENÇÃO: POSSÍVEL DUPLICIDADE",
                "Já existe lançamento ativo com o mesmo valor nessa data:",
                *[str(item) for item in duplicate_warnings],
                "Revise antes de confirmar.",
                "",
            ]
        )
    lines.append("✅ Confirma?")
    if count > 1:
        lines.extend([f"Total: {brl(draft.get('valor'))}", f"Parcelas: {count}x"])
        for entry in draft.get("entries", [])[:6]:
            lines.append(f"- {entry.get('data')}: {brl(entry.get('valor'))} - {entry.get('descricao')}")
        if len(draft.get("entries", [])) > 6:
            lines.append(f"- ... mais {len(draft.get('entries', [])) - 6} parcelas")
    else:
        lines.append(f"Valor: {brl(draft.get('valor'))}")
        lines.append(f"Data: {draft.get('data')}")
        lines.append(f"Descricao: {draft.get('descricao')}")
    category_ai_notice = draft.get("_category_ai_notice")
    if category_ai_notice:
        lines.extend(["", str(category_ai_notice)])
    lines.extend(
        [
            f"🏷️ Categoria: {draft.get('categoria_label')}",
            f"📌 Tipo: {draft.get('tipo')}",
            f"🏦 Conta: {draft.get('conta', {}).get('nome')}",
            f"👤 Usuario: {draft.get('usuario', {}).get('nome')}",
            "",
            "✅ SIM grava. ❌ NAO cancela.",
            "Se quiser ajustar: alterar data, categoria, valor, descricao, usuario, conta ou parcelas.",
        ]
    )
    return "\n".join(lines)


def attach_category_ai_notice(draft: dict[str, Any]) -> None:
    if CATEGORY_AI_NOTICE:
        draft["_category_ai_notice"] = CATEGORY_AI_NOTICE


def with_category_ai_notice(message: str, draft: dict[str, Any]) -> str:
    attach_category_ai_notice(draft)
    notice = str(draft.get("_category_ai_notice") or "")
    return f"{message}\n\n{notice}" if notice else message


def extract_marker_payload(text: str, marker: str, label: str) -> dict[str, Any] | None:
    raw = str(text or "")
    marker_at = raw.find(marker)
    if marker_at < 0:
        return None
    after = raw[marker_at + len(marker) :]
    json_match = re.search(r"```json\s*(\{.*?\})\s*```", after, flags=re.I | re.S)
    payload_text = json_match.group(1) if json_match else after.strip()
    if not json_match:
        start = payload_text.find("{")
        end = payload_text.rfind("}")
        if start < 0 or end <= start:
            raise ValueError(f"Pedido de {label} sem JSON válido.")
        payload_text = payload_text[start : end + 1]
    payload = json.loads(payload_text)
    if not isinstance(payload, dict):
        raise ValueError(f"Pedido de {label} precisa ser um objeto JSON.")
    return payload


def extract_edit_payload(text: str) -> dict[str, Any] | None:
    return extract_marker_payload(text, EDIT_REQUEST_MARKER, "edição")


def prepare_batch_edit_draft(text: str, catalog: Catalog) -> dict[str, Any] | None:
    payload = extract_edit_payload(text)
    if payload is None:
        return None
    action = str(payload.get("action") or "")
    if action != "editar_lancamentos_familiares":
        raise ValueError("Action de edição familiar inválida.")
    raw_changes = payload.get("changes")
    if not isinstance(raw_changes, list) or not raw_changes:
        raise ValueError("Pedido de edição sem alterações.")
    categories = category_by_id(catalog)
    accounts = {int(account.get("id") or 0): account for account in catalog.contas}
    users = {int(user.get("id") or 0): user for user in catalog.usuarios}
    changes: list[dict[str, Any]] = []
    for raw_change in raw_changes:
        if not isinstance(raw_change, dict):
            raise ValueError("Alteração inválida.")
        try:
            launch_id = int(raw_change.get("id"))
        except (TypeError, ValueError) as exc:
            raise ValueError("Alteração sem ID válido.") from exc
        change: dict[str, Any] = {"id": launch_id, "fields": {}}
        fields = raw_change.get("fields") if isinstance(raw_change.get("fields"), dict) else raw_change
        if "data" in fields:
            parsed_date = parse_date(str(fields.get("data") or ""))
            if not parsed_date:
                raise ValueError(f"Data inválida na edição #{launch_id}.")
            change["data"] = parsed_date
            change["fields"]["data"] = parsed_date
        if "valor" in fields:
            parsed_money = money_to_decimal(fields.get("valor"))
            if parsed_money is None:
                raise ValueError(f"Valor inválido na edição #{launch_id}.")
            change["valor"] = money_json(parsed_money)
            change["fields"]["valor"] = brl(parsed_money)
        if "descricao" in fields:
            description = format_description(str(fields.get("descricao") or ""))
            if not description:
                raise ValueError(f"Descrição vazia na edição #{launch_id}.")
            change["descricao"] = description
            change["fields"]["descrição"] = description
        if "categoria_id" in fields:
            category_id = int(fields.get("categoria_id") or 0)
            if category_id not in categories:
                raise ValueError(f"Categoria inválida na edição #{launch_id}.")
            change["categoria_id"] = category_id
            change["fields"]["categoria"] = category_label(categories[category_id], catalog)
            change["tipo"] = categories[category_id].get("tipo_padrao") or "variavel"
            change["fields"]["tipo"] = change["tipo"]
        if "conta_id" in fields:
            account_id = int(fields.get("conta_id") or 0)
            if account_id not in accounts:
                raise ValueError(f"Conta inválida na edição #{launch_id}.")
            change["conta_id"] = account_id
            change["fields"]["conta"] = accounts[account_id].get("nome") or str(account_id)
        if "usuario_lancamento_id" in fields:
            user_id = int(fields.get("usuario_lancamento_id") or 0)
            if user_id not in users:
                raise ValueError(f"Usuário inválido na edição #{launch_id}.")
            change["usuario_lancamento_id"] = user_id
            change["fields"]["usuário"] = users[user_id].get("nome") or str(user_id)
        if "tipo" in fields and norm(fields.get("tipo")) in {"fixo", "variavel", "projeto"}:
            change["tipo"] = norm(fields.get("tipo"))
            change["fields"]["tipo"] = change["tipo"]
        if not any(key in change for key in EDIT_COMMIT_FIELDS):
            raise ValueError(f"Edição #{launch_id} sem campos modificados.")
        changes.append(change)
    return {"waiting_for": "edit_confirmation", "changes": changes, "_source_text": str(text or "")}


def edit_summary(draft: dict[str, Any]) -> str:
    changes = draft.get("changes") if isinstance(draft.get("changes"), list) else []
    lines = [f"✅ Confirma editar {len(changes)} lançamento(s) familiar(es)?"]
    for change in changes[:12]:
        fields = change.get("fields") if isinstance(change.get("fields"), dict) else {}
        detail = "; ".join(f"{key}: {value}" for key, value in fields.items())
        lines.append(f"- #{change.get('id')}: {detail}")
    if len(changes) > 12:
        lines.append(f"- ... mais {len(changes) - 12} edição(ões)")
    lines.extend(["", "✅ SIM aplica as edições. ❌ NAO cancela."])
    return "\n".join(lines)


def looks_like_batch_entry_request(text: str) -> bool:
    clean = norm(text)
    return (
        "inclusao em lote" in clean
        or "inclusao em lotes" in clean
        or "insercao em lote" in clean
        or "insercao em lotes" in clean
        or "incluir em lote" in clean
        or "incluir em lotes" in clean
        or "lancamento em lote" in clean
        or "lancamentos em lote" in clean
        or "lancamento em lotes" in clean
        or "lancamentos em lotes" in clean
        or "colar excel" in clean
        or "importar excel" in clean
    )


def looks_like_dashboard_link_request(text: str) -> bool:
    clean = norm(text)
    return (
        "link financeiro" in clean
        or "dashboard financeiro" in clean
        or "painel financeiro" in clean
        or "abrir financeiro" in clean
        or "abre financeiro" in clean
        or "mandar link financeiro" in clean
        or "me manda o link financeiro" in clean
        or "link do financeiro" in clean
        or "link das financas" in clean
        or "link financas" in clean
    )


def batch_installment_entries(
    *,
    parsed_date: str,
    parsed_money: Decimal,
    description: str,
    entry_type: str,
    user_id: int,
    account_id: int,
    category_id: int,
    installments: int,
) -> list[dict[str, Any]]:
    values = split_installments(parsed_money, installments)
    group_id = str(uuid.uuid4()) if installments > 1 else None
    entries: list[dict[str, Any]] = []
    for idx, amount in enumerate(values, 1):
        suffix = f" {idx:02d}/{installments:02d}" if installments > 1 else ""
        entries.append(
            {
                "data": add_months(parsed_date, idx - 1),
                "valor": money_json(amount),
                "tipo": entry_type,
                "descricao": f"{description}{suffix}",
                "usuario_lancamento_id": user_id,
                "conta_id": account_id,
                "categoria_id": category_id,
                "created_by_usuario_id": user_id,
                "parcelamento_grupo_id": group_id,
                "parcela_atual": idx if installments > 1 else None,
                "parcelas_total": installments if installments > 1 else None,
                "ativo": True,
            }
        )
    return entries


def prepare_batch_insert_draft(text: str, catalog: Catalog) -> dict[str, Any] | None:
    payload = extract_marker_payload(text, BATCH_INSERT_MARKER, "inclusão em lote")
    if payload is None:
        return None
    action = str(payload.get("action") or "")
    if action != "incluir_lancamentos_familiares":
        raise ValueError("Action de inclusão em lote familiar inválida.")
    raw_entries = payload.get("entries")
    if not isinstance(raw_entries, list) or not raw_entries:
        raise ValueError("Pedido de inclusão em lote sem lançamentos.")
    categories = category_by_id(catalog)
    accounts = {int(account.get("id") or 0): account for account in catalog.contas}
    users = {int(user.get("id") or 0): user for user in catalog.usuarios}
    batch_user_id = int(payload.get("usuario_lancamento_id") or 0)
    if batch_user_id and batch_user_id not in users:
        raise ValueError("Usuário geral inválido para inclusão em lote.")
    entries: list[dict[str, Any]] = []
    previews: list[dict[str, Any]] = []
    for index, raw_entry in enumerate(raw_entries, 1):
        if not isinstance(raw_entry, dict):
            raise ValueError(f"Lançamento {index} inválido.")
        parsed_date = parse_date(str(raw_entry.get("data") or ""))
        if not parsed_date:
            raise ValueError(f"Data inválida no lançamento {index}.")
        parsed_money = money_to_decimal(raw_entry.get("valor"))
        if parsed_money is None or parsed_money <= 0:
            raise ValueError(f"Valor inválido no lançamento {index}.")
        description = format_description(str(raw_entry.get("descricao") or ""))
        if not description:
            raise ValueError(f"Descrição vazia no lançamento {index}.")
        category_id = int(raw_entry.get("categoria_id") or 0)
        account_id = int(raw_entry.get("conta_id") or 0)
        user_id = batch_user_id or int(raw_entry.get("usuario_lancamento_id") or 0)
        if category_id not in categories:
            raise ValueError(f"Categoria inválida no lançamento {index}.")
        if account_id not in accounts:
            raise ValueError(f"Conta inválida no lançamento {index}.")
        if user_id not in users:
            raise ValueError(f"Usuário inválido no lançamento {index}.")
        entry_type = norm(raw_entry.get("tipo")) if raw_entry.get("tipo") else ""
        if entry_type not in {"fixo", "variavel", "projeto"}:
            entry_type = categories[category_id].get("tipo_padrao") or "variavel"
        try:
            installments = int(raw_entry.get("parcelas") or 1)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Parcelas inválidas no lançamento {index}.") from exc
        if installments < 1 or installments > 48:
            raise ValueError(f"Parcelas do lançamento {index} precisam ficar entre 1 e 48.")
        entry_rows = batch_installment_entries(
            parsed_date=parsed_date,
            parsed_money=parsed_money,
            description=description,
            entry_type=entry_type,
            user_id=user_id,
            account_id=account_id,
            category_id=category_id,
            installments=installments,
        )
        entries.extend(entry_rows)
        for entry in entry_rows:
            previews.append(
                {
                    "data": entry["data"],
                    "valor": brl(entry["valor"]),
                    "descricao": entry["descricao"],
                    "categoria": category_label(categories[category_id], catalog),
                    "conta": accounts[account_id].get("nome") or str(account_id),
                    "usuario": users[user_id].get("nome") or str(user_id),
                }
            )
    return {
        "waiting_for": "batch_confirmation",
        "entries": entries,
        "previews": previews,
        "_source_text": str(text or ""),
    }


def batch_summary(draft: dict[str, Any]) -> str:
    entries = draft.get("entries") if isinstance(draft.get("entries"), list) else []
    previews = draft.get("previews") if isinstance(draft.get("previews"), list) else []
    total = sum((money_to_decimal(entry.get("valor")) or Decimal("0.00")) for entry in entries)
    lines = [
        "✅ Confirma a inclusão deste lote?",
        "",
        "📌 Resumo",
        f"• Lançamentos: {len(entries)}",
        f"• Valor total: {brl(total)}",
        "",
        "📋 Lançamentos",
    ]
    for index, item in enumerate(previews[:12], 1):
        lines.extend(
            [
                "",
                f"#{index} — {item.get('descricao')}",
                f"📅 Data: {item.get('data')}",
                f"💰 Valor: {item.get('valor')}",
                f"🏷️ Categoria: {item.get('categoria')}",
                f"🏦 Conta: {item.get('conta')}",
                f"👤 Usuário: {item.get('usuario')}",
            ]
        )
    if len(previews) > 12:
        lines.extend(["", f"... mais {len(previews) - 12} lançamento(s)"])
    lines.extend(["", "✅ SIM grava o lote. ❌ NAO cancela."])
    return "\n".join(lines)


def parse_edit_request(text: str) -> tuple[str, str] | None:
    clean = norm(text)
    if clean in {"ajuda", "help", "comandos"}:
        return ("help", "")
    if clean in {"opcoes", "opções", "listar opcoes", "listar opções"}:
        return ("options", "")
    match = re.match(r"^(?:alterar|corrigir|editar|mudar|trocar|ajustar|ajuste)\s+(.+)$", str(text or "").strip(), flags=re.I)
    if not match:
        return None
    payload = match.group(1).strip()
    payload_norm = norm(payload)
    for raw_field, canonical in sorted(EDITABLE_FIELDS.items(), key=lambda item: -len(item[0])):
        raw_norm = norm(raw_field)
        if payload_norm == raw_norm:
            return canonical, ""
        if payload_norm.startswith(raw_norm + " "):
            value = payload[len(raw_field) :].strip()
            value = re.sub(r"^(?:para\s*:|para|:|=)\s*", "", value, flags=re.I).strip()
            return canonical, value
    return ("unknown", payload)


def reset_for_edit(draft: dict[str, Any], field: str) -> None:
    draft.pop("waiting_for", None)
    draft.pop("candidates", None)
    draft.pop("entries", None)
    if field == "categoria":
        for key in ["id_categoria", "categoria", "categoria_label"]:
            draft.pop(key, None)
    elif field == "conta":
        for key in ["id_conta", "conta"]:
            draft.pop(key, None)
    elif field == "usuario":
        for key in ["id_usuario", "usuario"]:
            draft.pop(key, None)
    elif field == "parcelas":
        draft.pop("parcelas", None)
        draft.pop("parcelamento_grupo_id", None)
    else:
        draft.pop(field, None)


def apply_selected(kind: str, selected: dict[str, Any], draft: dict[str, Any], catalog: Catalog) -> None:
    if kind == "categoria":
        draft["id_categoria"] = selected["id"]
        draft["categoria"] = {k: selected.get(k) for k in ["id", "grupo_id", "nome", "tipo_padrao"]}
        draft["categoria_label"] = category_label(selected, catalog)
        draft["tipo"] = selected.get("tipo_padrao") or "variavel"
    elif kind == "conta":
        draft["id_conta"] = selected["id"]
        draft["conta"] = {k: selected.get(k) for k in ["id", "nome", "tipo", "titular_usuario_id"]}
        titular_id = selected.get("titular_usuario_id")
        current_user = draft.get("usuario") if isinstance(draft.get("usuario"), dict) else {}
        if titular_id and current_user.get("nome") == "Matheus" and not draft.get("_usuario_lancamento_explicit"):
            for user in catalog.usuarios:
                if int(user.get("id") or 0) == int(titular_id or 0):
                    draft["id_usuario"] = user["id"]
                    draft["usuario"] = {k: user.get(k) for k in ["id", "nome"]}
                    break
    elif kind == "usuario":
        draft["id_usuario"] = selected["id"]
        draft["usuario"] = {k: selected.get(k) for k in ["id", "nome"]}


def description_from_context_hint(text: str) -> str | None:
    raw = re.sub(r"\s+", " ", str(text or "")).strip(" .,:;-")
    raw = re.sub(r"^(?:trata[-\s]?se\s+de|e\s+|é\s+|eh\s+|foi\s+|compra\s+de|produto\s+)\s*", "", raw, flags=re.I).strip(" .,:;-")
    raw = re.sub(r"^(?:um|uma|o|a|os|as)\s+", "", raw, flags=re.I).strip(" .,:;-")
    if not raw or len(norm(raw)) < 4:
        return None
    if norm(raw) in {"sim", "nao", "não", "cancelar", "cancela"}:
        return None
    return format_description(raw)


def merge_marketplace_description(existing: str, hint: str) -> str:
    existing_clean = norm(existing)
    if "shopee" in existing_clean and "shopee" not in norm(hint):
        return f"Shopee - {hint}"
    if "amazon" in existing_clean and "amazon" not in norm(hint):
        return f"Amazon - {hint}"
    return hint


def update_draft(message: str, draft: dict[str, Any], catalog: Catalog) -> dict[str, Any]:
    batch_edit = prepare_batch_edit_draft(message, catalog)
    if batch_edit:
        return batch_edit
    batch_insert = prepare_batch_insert_draft(message, catalog)
    if batch_insert:
        return batch_insert
    if looks_like_batch_entry_request(message) or looks_like_dashboard_link_request(message):
        return {
            "waiting_for": "dashboard_link",
            "_dashboard_reason": "batch_entry" if looks_like_batch_entry_request(message) else "dashboard_request",
        }

    denied = forbidden_reason(message)
    if denied:
        return {"waiting_for": "blocked_intent", "_blocked_reason": denied}

    draft.pop("_duplicate_warnings", None)
    text = strip_command(message)
    sms_text = parse_caixa_sms(text)
    if sms_text:
        draft["_source_sms"] = text
        text = sms_text
    draft["_source_text"] = text

    waiting_for = draft.get("waiting_for")
    if waiting_for == "parcelas":
        clean = norm(text)
        if clean.isdigit():
            total = int(clean)
            if total < 1 or total > 48:
                raise ValueError("Parcelamento precisa ter entre 1 e 48 parcelas.")
            draft["parcelas"] = total
            if total == 1:
                draft.pop("parcelamento_grupo_id", None)
            draft.pop("waiting_for", None)
            rebuild_entries(draft)
            return draft

    if waiting_for in {"categoria", "conta", "usuario"}:
        selected = choose_by_reply(text, draft.get("candidates", []), ["nome", "categoria_label"])
        if selected:
            if waiting_for == "categoria":
                detail = option_reply_detail(text)
                description_hint = description_from_context_hint(detail)
                if description_hint:
                    draft["descricao"] = merge_marketplace_description(str(draft.get("descricao") or ""), description_hint)
            apply_selected(waiting_for, selected, draft, catalog)
            draft.pop("waiting_for", None)
            draft.pop("candidates", None)
            rebuild_entries(draft)
            return draft
        if waiting_for == "categoria" and not norm(text).isdigit():
            group = group_hint(text, catalog)
            if group and not category_specific_hint(text):
                draft["_source_text"] = " ".join([str(draft.get("_source_text") or ""), text]).strip()
                draft["candidates"] = categories_for_group(group, catalog)
                return draft
            combined_hint = " ".join([str(draft.get("_source_text") or ""), str(draft.get("descricao") or ""), text]).strip()
            category = resolve_category(text, catalog) or resolve_category(combined_hint, catalog)
            if category:
                description_hint = description_from_context_hint(text)
                if description_hint:
                    draft["descricao"] = merge_marketplace_description(str(draft.get("descricao") or ""), description_hint)
                apply_selected("categoria", category, draft, catalog)
                draft.pop("waiting_for", None)
                draft.pop("candidates", None)
                rebuild_entries(draft)
                return draft
            draft["_source_text"] = combined_hint
            draft["candidates"] = suggested_categories(combined_hint, catalog)
            return draft

    edit = parse_edit_request(text)
    if edit:
        field, value = edit
        if field == "help":
            draft["_notice"] = "help"
            return draft
        if field == "options":
            draft["_notice"] = "options"
            return draft
        if field == "unknown":
            draft["waiting_for"] = "unsupported_edit"
            return draft
        reset_for_edit(draft, field)
        if not value:
            draft["waiting_for"] = field
            return draft
        text = value

    values, free_text = parse_key_values(text)
    if not values:
        inline_values, inline_rest = parse_inline_updates(text)
        values, free_text = parse_key_values(inline_rest if inline_values else text)
        values.update(inline_values)
    free_text = free_text.strip()
    source_for_inference = " ".join([free_text, *[str(v) for v in values.values()]]).strip()

    if "comprovante_url" in values:
        draft["comprovante_url"] = values["comprovante_url"]
    if "observacao" in values:
        draft["observacao"] = values["observacao"]
    if "tipo" in values and norm(values["tipo"]) in {"fixo", "variavel", "projeto"}:
        draft["tipo"] = norm(values["tipo"])

    date_value = values.get("data")
    if date_value:
        parsed = parse_date(date_value)
        if not parsed:
            draft["waiting_for"] = "data"
            return draft
        draft["data"] = parsed
    elif not draft.get("data"):
        inline_date, free_text = extract_inline_date(free_text)
        draft["data"] = inline_date or business_today().isoformat()

    has_explicit_installments = False
    if "parcelas" in values:
        try:
            draft["parcelas"] = int(values["parcelas"])
            has_explicit_installments = True
        except ValueError:
            draft["waiting_for"] = "parcelas"
            return draft
    else:
        installments, free_text = parse_installments(free_text)
        if installments:
            draft["parcelas"] = installments
            has_explicit_installments = True
    if has_explicit_installments and draft.get("data") == business_today().isoformat() and os.environ.get("FINANCEIRO_FAMILIAR_REFERENCE_DATE"):
        draft["data"] = relative_today().isoformat()
    if int(draft.get("parcelas") or 1) < 1:
        draft["parcelas"] = 1

    money_source = values.get("valor")
    if money_source:
        value = money_to_decimal(money_source)
        if value is None:
            draft["waiting_for"] = "valor"
            return draft
        draft["valor"] = money_json(value)
    elif not draft.get("valor"):
        value, free_text = extract_receipt_money(free_text) if looks_like_receipt(free_text) else extract_money(free_text)
        if value is not None:
            draft["valor"] = money_json(value)

    user_source = values.get("usuario") or values.get("usuario_lancamento")
    if user_source:
        user = resolve_user(user_source, catalog)
        if user:
            reset_for_edit(draft, "usuario")
            apply_selected("usuario", user, draft, catalog)
            draft["_usuario_lancamento_explicit"] = True

    account_source = values.get("conta") or values.get("cartao") or values.get("cartão")
    if account_source:
        account = resolve_account(account_source, catalog)
        if account:
            reset_for_edit(draft, "conta")
            apply_selected("conta", account, draft, catalog)
    elif not draft.get("id_conta"):
        account = resolve_account(source_for_inference, catalog)
        if account:
            apply_selected("conta", account, draft, catalog)

    category_source = values.get("categoria")
    if category_source:
        category = resolve_category(category_source, catalog)
        if category:
            reset_for_edit(draft, "categoria")
            apply_selected("categoria", category, draft, catalog)
    elif not draft.get("id_categoria"):
        category = resolve_category(source_for_inference, catalog)
        if category:
            apply_selected("categoria", category, draft, catalog)

    if not draft.get("id_usuario") and len(catalog.usuarios) == 1:
        apply_selected("usuario", catalog.usuarios[0], draft, catalog)
    if not draft.get("id_usuario"):
        titular_id = (draft.get("conta") or {}).get("titular_usuario_id")
        if titular_id:
            for user in catalog.usuarios:
                if int(user.get("id") or 0) == int(titular_id or 0):
                    apply_selected("usuario", user, draft, catalog)
                    break
    if not draft.get("id_usuario"):
        matheus = resolve_user("Matheus", catalog)
        if matheus:
            apply_selected("usuario", matheus, draft, catalog)

    desc_source = values.get("descricao") or values.get("desc")
    if desc_source:
        draft["descricao"] = format_description(desc_source)
    elif not draft.get("descricao"):
        counterparty = receipt_counterparty(free_text)
        if counterparty:
            draft["_receipt_counterparty"] = counterparty
            draft["descricao"] = format_description(counterparty)
        else:
            draft["descricao"] = format_description(free_text)

    rebuild_entries(draft)
    return draft


def help_message() -> str:
    return "\n".join(
        [
            "Comandos disponíveis neste fluxo:",
            "- SIM: grava somente quando a tela de confirmação estiver correta",
            "- NAO ou cancelar: cancela sem gravar",
            "- alterar categoria [texto]",
            "- alterar conta [texto]",
            "- alterar usuario [nome]",
            "- alterar valor [valor]",
            "- alterar data [YYYY-MM-DD, DD/MM/YYYY, hoje ou ontem]",
            "- alterar descricao [texto]",
            "- alterar parcelas [numero]",
        ]
    )


def response_for_draft(
    draft: dict[str, Any],
    catalog: Catalog,
    db: Supabase | None = None,
    telegram_chat_id: str = "",
) -> dict[str, Any]:
    if draft.get("waiting_for") == "edit_confirmation":
        return {"action": "ask_confirmation", "message": edit_summary(draft), "draft": draft}
    if draft.get("waiting_for") == "batch_confirmation":
        return {"action": "ask_confirmation", "message": batch_summary(draft), "draft": draft}
    if draft.get("waiting_for") == "fatura_confirmation":
        return {"action": "ask_confirmation", "message": statement_close_summary(draft), "draft": draft}
    if draft.get("waiting_for") == "batch_link":
        url = str(draft.get("batch_url") or "")
        return {
            "action": "batch_entry_link",
            "message": f"📥 Inclusão em lote familiar: {url}\n\nCole os dados do Excel, complete categoria/conta/usuário e depois copie a mensagem gerada de volta aqui no Telegram.",
            "batch_url": url,
        }
    if draft.get("waiting_for") == "dashboard_link":
        if db is None:
            raise RuntimeError("Dashboard precisa consultar o Supabase.")
        today = business_today()
        start, end = month_range(today.year, today.month)
        url = create_dashboard_link(db, catalog, start, end, start.strftime("%m/%Y"), telegram_chat_id)
        return {
            "action": "dashboard_link",
            "message": "\n".join(
                [
                    f"📥 Dashboard financeiro familiar: {url}",
                    "",
                    "Link tokenizado válido por 60 minutos no grupo autorizado.",
                    "Use o botão Nova transação na tela Lançamentos para colar Excel/planilha, revisar, preparar e confirmar a inclusão sem voltar para o Telegram.",
                ]
            ),
            "dashboard_url": url,
            "expires_in": DASHBOARD_TTL_SECONDS,
        }
    if draft.get("waiting_for") == "blocked_intent":
        message = str(draft.pop("_blocked_reason", "") or "Ação não permitida neste fluxo.")
        draft.pop("waiting_for", None)
        return {"action": "blocked_intent", "message": message, "draft": draft}
    notice = draft.pop("_notice", None)
    if notice == "help":
        return {"action": "help", "message": help_message(), "draft": draft}
    if notice == "options" and draft.get("waiting_for") in {"categoria", "conta", "usuario"}:
        pass
    elif notice == "options":
        return {"action": "help", "message": "Você está na tela de confirmação.\n" + help_message(), "draft": draft}

    waiting_for = draft.get("waiting_for")
    if waiting_for == "unsupported_edit":
        draft["waiting_for"] = "confirmation" if draft.get("entries") else ""
        return {"action": "unsupported_edit", "message": "Não reconheci esse ajuste. " + help_message(), "draft": draft}
    if waiting_for == "data":
        return {"action": "ask_data", "message": "Qual data devo usar? Exemplo: hoje, ontem, 2026-05-05 ou 05/05/2026.", "draft": draft}
    if waiting_for == "valor":
        return {"action": "ask_valor", "message": "Qual valor devo lançar? Exemplo: 123,45", "draft": draft}
    if waiting_for == "parcelas":
        return {"action": "ask_parcelas", "message": "Quantas parcelas? Exemplo: 3", "draft": draft}
    if waiting_for == "descricao":
        return {"action": "ask_descricao", "message": "Qual descrição devo usar para o lançamento?", "draft": draft}
    if waiting_for == "categoria":
        candidates = draft.get("candidates") or suggested_categories(str(draft.get("_source_text") or draft.get("descricao") or ""), catalog)
        draft["candidates"] = candidates
        message = "Qual categoria?\n" + format_options(candidates, "categoria", catalog)
        return {"action": "ask_categoria", "message": with_category_ai_notice(message, draft), "draft": draft}
    if waiting_for == "conta":
        candidates = draft.get("candidates") or catalog.contas
        draft["candidates"] = candidates
        return {"action": "ask_conta", "message": "Qual conta?\n" + format_options(candidates, "conta", catalog), "draft": draft}
    if waiting_for == "usuario":
        candidates = draft.get("candidates") or catalog.usuarios
        draft["candidates"] = candidates
        return {"action": "ask_usuario", "message": "Qual usuario?\n" + format_options(candidates, "usuario", catalog), "draft": draft}

    missing = []
    for key, label in [
        ("data", "data"),
        ("valor", "valor"),
        ("descricao", "descricao"),
        ("id_usuario", "usuario"),
        ("id_conta", "conta"),
        ("id_categoria", "categoria"),
    ]:
        if draft.get(key) in (None, ""):
            missing.append(label)
    if "categoria" in missing:
        candidates = suggested_categories(str(draft.get("_source_text") or draft.get("descricao") or ""), catalog)
        draft["waiting_for"] = "categoria"
        draft["candidates"] = candidates
        intro = ""
        if candidates:
            intro = f"Categoria sugerida: {category_label(candidates[0], catalog)}\n"
        message = intro + "Qual categoria?\n" + format_options(candidates, "categoria", catalog)
        return {"action": "ask_categoria", "message": with_category_ai_notice(message, draft), "draft": draft}
    if "conta" in missing:
        draft["waiting_for"] = "conta"
        draft["candidates"] = catalog.contas
        return {"action": "ask_conta", "message": "Qual conta?\n" + format_options(catalog.contas, "conta", catalog), "draft": draft}
    if "usuario" in missing:
        draft["waiting_for"] = "usuario"
        draft["candidates"] = catalog.usuarios
        return {"action": "ask_usuario", "message": "Qual usuario?\n" + format_options(catalog.usuarios, "usuario", catalog), "draft": draft}
    if missing:
        draft["waiting_for"] = missing[0]
        return {"action": "ask_missing", "message": "Preciso completar: " + ", ".join(missing) + ". Pode me mandar esses dados?", "draft": draft}

    draft["waiting_for"] = "confirmation"
    attach_category_ai_notice(draft)
    rebuild_entries(draft)
    draft["_duplicate_warnings"] = same_day_value_warnings(db, draft)
    return {"action": "ask_confirmation", "message": draft_summary(draft), "draft": draft}


def normalize_telegram_target(value: str) -> str:
    raw = str(value or "").strip()
    match = re.search(r"telegram:(-?\d+)", raw)
    return match.group(1) if match else raw


def configured_allowed_groups() -> set[str]:
    allowed = {
        normalize_telegram_target(item)
        for item in os.environ.get(ALLOWED_GROUP_ENV, "").split(",")
        if item.strip()
    }
    try:
        cfg = json.loads(OPENCLAW_CONFIG_PATH.read_text(encoding="utf-8"))
        groups = cfg.get("channels", {}).get("telegram", {}).get("groups", {})
        for group_id, group_cfg in groups.items():
            if group_cfg.get("financeiroFamiliar") is True or group_cfg.get("purpose") == "financeiro-familiar":
                allowed.add(normalize_telegram_target(group_id))
    except Exception:
        pass
    return allowed


def ensure_allowed_chat(chat_id: str | None, *, require_chat: bool = False) -> None:
    allowed = configured_allowed_groups()
    if not allowed:
        return
    current = normalize_telegram_target(chat_id or "")
    if not current and not require_chat:
        return
    if current not in allowed:
        raise RuntimeError("Fluxo financeiro familiar disponível apenas no grupo Telegram autorizado.")


def validate_commit_draft(draft: dict[str, Any]) -> list[dict[str, Any]]:
    if draft.get("waiting_for") != "confirmation":
        raise RuntimeError("Lançamento ainda não está na etapa de confirmação.")
    entries = draft.get("entries")
    if not isinstance(entries, list) or not entries:
        raise RuntimeError("Lançamento incompleto: parcelas não preparadas.")
    required = ["data", "valor", "tipo", "descricao", "usuario_lancamento_id", "conta_id", "categoria_id"]
    for entry in entries:
        missing = [key for key in required if entry.get(key) in (None, "")]
        if missing:
            raise RuntimeError("Lançamento incompleto: " + ", ".join(missing))
    return [{key: value for key, value in entry.items() if value is not None} for entry in entries]


def fam_lancamentos_columns_available(db: Supabase, columns: tuple[str, ...]) -> bool:
    try:
        db.get("fam_lancamentos", {"select": ",".join(columns), "limit": "1"})
    except RuntimeError as exc:
        text = str(exc)
        if any(column in text for column in columns) and ("does not exist" in text or "PGRST" in text or "42703" in text):
            return False
        raise
    return True


def build_audit_fields(audit: dict[str, str] | None) -> dict[str, Any]:
    if not audit:
        return {}
    origin = str(audit.get("origin") or "").strip()
    session = str(audit.get("session") or "").strip()
    requested_by = str(audit.get("requested_by") or "").strip()
    if not any([origin, session, requested_by]):
        return {}
    payload = {
        "auditoria_origem": origin,
        "auditoria_sessao": session,
        "auditoria_usuario_solicitante": requested_by,
        "auditoria_confirmado_em": datetime.now(ZoneInfo(BUSINESS_TIMEZONE)).isoformat(),
    }
    return {key: value for key, value in payload.items() if value not in (None, "")}


def apply_audit_fields(db: Supabase, payload: dict[str, Any] | list[dict[str, Any]], audit: dict[str, str] | None) -> dict[str, Any] | list[dict[str, Any]]:
    audit_fields = build_audit_fields(audit)
    if not audit_fields:
        return payload
    if not fam_lancamentos_columns_available(db, AUDIT_COMMIT_FIELDS):
        return payload
    if isinstance(payload, list):
        return [{**item, **audit_fields} for item in payload]
    return {**payload, **audit_fields}


def commit_draft(db: Supabase, draft: dict[str, Any], audit: dict[str, str] | None = None) -> dict[str, Any]:
    payload = apply_audit_fields(db, validate_commit_draft(draft), audit)
    inserted = db.post("fam_lancamentos", payload if len(payload) > 1 else payload[0])
    ids = ", ".join(f"#{row.get('id')}" for row in inserted if row.get("id"))
    return {
        "action": "committed",
        "message": f"Lançamento familiar gravado com sucesso. IDs {ids}." if ids else "Lançamento familiar gravado com sucesso.",
        "records": inserted,
    }


def validate_batch_insert_draft(draft: dict[str, Any]) -> list[dict[str, Any]]:
    if draft.get("waiting_for") != "batch_confirmation":
        raise RuntimeError("Lote ainda não está na etapa de confirmação.")
    entries = draft.get("entries")
    if not isinstance(entries, list) or not entries:
        raise RuntimeError("Lote sem lançamentos preparados.")
    required = ["data", "valor", "tipo", "descricao", "usuario_lancamento_id", "conta_id", "categoria_id"]
    payload: list[dict[str, Any]] = []
    for index, entry in enumerate(entries, 1):
        if not isinstance(entry, dict):
            raise RuntimeError(f"Lançamento {index} inválido.")
        missing = [key for key in required if entry.get(key) in (None, "")]
        if missing:
            raise RuntimeError(f"Lançamento {index} incompleto: " + ", ".join(missing))
        payload.append({key: entry.get(key) for key in BATCH_ENTRY_FIELDS})
    return payload


def commit_batch_insert_draft(db: Supabase, draft: dict[str, Any], audit: dict[str, str] | None = None) -> dict[str, Any]:
    payload = apply_audit_fields(db, validate_batch_insert_draft(draft), audit)
    inserted = db.post("fam_lancamentos", payload)
    ids = ", ".join(f"#{row.get('id')}" for row in inserted if row.get("id"))
    return {
        "action": "batch_committed",
        "message": f"Lote familiar gravado com sucesso. IDs {ids}." if ids else "Lote familiar gravado com sucesso.",
        "records": inserted,
    }


def validate_edit_draft(draft: dict[str, Any]) -> list[dict[str, Any]]:
    if draft.get("waiting_for") != "edit_confirmation":
        raise RuntimeError("Edição ainda não está na etapa de confirmação.")
    changes = draft.get("changes")
    if not isinstance(changes, list) or not changes:
        raise RuntimeError("Nenhuma alteração preparada.")
    prepared: list[dict[str, Any]] = []
    seen_ids: set[int] = set()
    for item in changes:
        if not isinstance(item, dict):
            raise RuntimeError("Alteração inválida.")
        try:
            launch_id = int(item.get("id"))
        except (TypeError, ValueError) as exc:
            raise RuntimeError("Alteração sem ID válido.") from exc
        if launch_id in seen_ids:
            raise RuntimeError(f"Alteração duplicada para o lançamento #{launch_id}.")
        seen_ids.add(launch_id)
        payload = {key: value for key, value in item.items() if key in EDIT_COMMIT_FIELDS and value not in (None, "")}
        if not payload:
            raise RuntimeError(f"Alteração #{launch_id} não tem campos modificados.")
        prepared.append({"id": launch_id, "payload": payload})
    return prepared


def ensure_launches_not_in_statement(db: Supabase, launch_ids: list[int]) -> None:
    if not launch_ids or not fam_lancamentos_columns_available(db, ("fatura_id",)):
        return
    ids_filter = ",".join(str(launch_id) for launch_id in launch_ids)
    rows = db.get(
        "fam_lancamentos",
        {
            "select": "id,fatura_id",
            "id": f"in.({ids_filter})",
            "ativo": "eq.true",
        },
    )
    locked = [
        f"#{row.get('id')} (fatura #{row.get('fatura_id')})"
        for row in rows
        if row.get("fatura_id") not in (None, "")
    ]
    if locked:
        raise RuntimeError(
            "Lançamento conciliado não pode ser alterado. Remova/desfaça o vínculo da fatura antes de editar: "
            + ", ".join(locked)
            + "."
        )


def commit_edit_draft(db: Supabase, draft: dict[str, Any], audit: dict[str, str] | None = None) -> dict[str, Any]:
    updates = validate_edit_draft(draft)
    ensure_launches_not_in_statement(db, [int(update["id"]) for update in updates])
    audit_fields = build_audit_fields(audit)
    if audit_fields and fam_lancamentos_columns_available(db, AUDIT_COMMIT_FIELDS):
        updates = [{**update, "payload": {**update["payload"], **audit_fields}} for update in updates]
    records: list[dict[str, Any]] = []
    for update in updates:
        rows = db.patch(
            "fam_lancamentos",
            update["payload"],
            {"id": f"eq.{update['id']}", "ativo": "eq.true"},
        )
        if not rows:
            raise RuntimeError(f"Lançamento #{update['id']} não encontrado ou inativo.")
        records.extend(rows)
    ids = ", ".join(f"#{row.get('id')}" for row in records if row.get("id"))
    return {
        "action": "edited",
        "message": f"Edição familiar aplicada com sucesso. IDs {ids}." if ids else "Edição familiar aplicada com sucesso.",
        "records": records,
    }


def validate_statement_close_draft(draft: dict[str, Any]) -> dict[str, Any]:
    if draft.get("waiting_for") != "fatura_confirmation":
        raise RuntimeError("Fechamento de fatura ainda não está na etapa de confirmação.")
    ids = draft.get("lancamento_ids")
    if not isinstance(ids, list) or not ids:
        raise RuntimeError("Fechamento de fatura sem lançamentos para marcar.")
    clean_ids: list[int] = []
    for launch_id in ids:
        try:
            clean_ids.append(int(launch_id))
        except (TypeError, ValueError) as exc:
            raise RuntimeError("Fechamento de fatura com ID inválido.") from exc
    payload = {key: draft.get(key) for key in STATEMENT_FIELDS}
    missing = [key for key, value in payload.items() if value in (None, "")]
    if missing:
        raise RuntimeError("Fechamento de fatura incompleto: " + ", ".join(missing))
    for key, value in payload.items():
        try:
            date.fromisoformat(str(value))
        except ValueError as exc:
            raise RuntimeError(f"Data inválida em {key}: {value}") from exc
    return {"ids": clean_ids, "payload": payload}


def statement_table_missing(exc: Exception) -> bool:
    text = str(exc)
    return "fam_faturas_cartao" in text and ("does not exist" in text or "PGRST" in text or "42P01" in text)


def get_last_closed_statement(db: Supabase, conta_id: int, before_period_end: date | None = None) -> dict[str, Any] | None:
    try:
        rows = db.get(
            "fam_faturas_cartao",
            {
                "select": "id,conta_id,competencia_mes,periodo_inicio,periodo_fim,vencimento,status,valor_informado,valor_lancamentos,diferenca",
                "conta_id": f"eq.{conta_id}",
                "order": "periodo_fim.desc,id.desc",
                "limit": "12",
            },
        )
    except RuntimeError as exc:
        if statement_table_missing(exc):
            return None
        raise
    for row in rows:
        status = str(row.get("status") or "")
        if status not in {"fechada", "conciliada"}:
            continue
        try:
            period_end = date.fromisoformat(str(row.get("periodo_fim")))
        except ValueError:
            continue
        if before_period_end and period_end >= before_period_end:
            continue
        return row
    return None


def ensure_statement_storage(db: Supabase) -> None:
    ensure_statement_columns(db)
    try:
        db.get("fam_lancamentos", {"select": "fatura_id", "limit": "1"})
        db.get("fam_faturas_cartao", {"select": "id,conta_id,competencia_mes,periodo_inicio,periodo_fim,vencimento,status", "limit": "1"})
    except RuntimeError as exc:
        text = str(exc)
        if statement_table_missing(exc) or any(field in text for field in STATEMENT_CONCILIATION_FIELDS):
            raise RuntimeError(
                "O banco familiar ainda não tem a estrutura de conciliação de faturas. Aplique a migração "
                "db/migrations/2026-05-13_financeiro_familiar_faturas_cartoes.sql antes de confirmar fechamentos."
            ) from exc
        raise


def save_card_statement(
    db: Supabase,
    draft: dict[str, Any],
    audit: dict[str, str] | None,
    payload: dict[str, Any],
) -> dict[str, Any]:
    competencia = str(payload["competencia_mes"])
    row_payload = {
        "conta_id": int(draft.get("conta_id") or 0),
        "competencia_mes": competencia,
        "periodo_inicio": payload["fatura_periodo_inicio"],
        "periodo_fim": payload["fatura_periodo_fim"],
        "vencimento": payload["fatura_vencimento"],
        "valor_informado": money_json(draft.get("valor_fatura")),
        "valor_lancamentos": money_json(draft.get("valor_lancamentos")),
        "diferenca": money_json(draft.get("diferenca")),
        "status": "conciliada",
    }
    existing = db.get(
        "fam_faturas_cartao",
        {
            "select": "id",
            "conta_id": f"eq.{row_payload['conta_id']}",
            "competencia_mes": f"eq.{competencia}",
            "limit": "1",
        },
    )
    if existing:
        statement_id = int(existing[0]["id"])
        rows = db.patch("fam_faturas_cartao", row_payload, {"id": f"eq.{statement_id}"})
    else:
        rows = db.post("fam_faturas_cartao", row_payload)
    if not rows:
        raise RuntimeError("Não consegui gravar a fatura conciliada.")
    return rows[0]


def commit_statement_close_draft(db: Supabase, draft: dict[str, Any], audit: dict[str, str] | None = None) -> dict[str, Any]:
    ensure_statement_storage(db)
    prepared = validate_statement_close_draft(draft)
    payload = apply_audit_fields(db, prepared["payload"], audit)
    statement = save_card_statement(db, draft, audit, prepared["payload"])
    statement_id = int(statement.get("id") or 0)
    payload = {
        **payload,
        "fatura_id": statement_id,
    }
    records: list[dict[str, Any]] = []
    for launch_id in prepared["ids"]:
        rows = db.patch(
            "fam_lancamentos",
            payload,
            {"id": f"eq.{launch_id}", "ativo": "eq.true", "fatura_id": "is.null"},
        )
        if not rows:
            raise RuntimeError(f"Lançamento #{launch_id} não encontrado, inativo ou já vinculado a outra fatura.")
        records.extend(rows)
    ids = ", ".join(f"#{row.get('id')}" for row in records if row.get("id"))
    return {
        "action": "fatura_closed",
        "message": f"Fatura familiar conciliada com sucesso. Fatura #{statement_id}. Lançamentos marcados: {ids}.",
        "statement": statement,
        "records": records,
    }


def category_by_id(catalog: Catalog) -> dict[int, dict[str, Any]]:
    return {int(category.get("id") or 0): category for category in catalog.categorias}


def row_display(row: dict[str, Any], catalog: Catalog) -> dict[str, Any]:
    categories = category_by_id(catalog)
    accounts = {int(account.get("id") or 0): account for account in catalog.contas}
    users = {int(user.get("id") or 0): user for user in catalog.usuarios}
    category = categories.get(int(row.get("categoria_id") or 0))
    group = group_name(catalog, category.get("grupo_id")) if category else ""
    account = accounts.get(int(row.get("conta_id") or 0))
    user = users.get(int(row.get("usuario_lancamento_id") or 0))
    return {
        "id": row.get("id"),
        "data": row.get("data"),
        "competencia_mes": row.get("competencia_mes"),
        "fatura_vencimento": row.get("fatura_vencimento"),
        "fatura_periodo_inicio": row.get("fatura_periodo_inicio"),
        "fatura_periodo_fim": row.get("fatura_periodo_fim"),
        "fatura_id": row.get("fatura_id"),
        "valor": money_json(row.get("valor")),
        "descricao": row.get("descricao") or "",
        "tipo": row.get("tipo") or "",
        "categoria_id": row.get("categoria_id"),
        "conta_id": row.get("conta_id"),
        "usuario_lancamento_id": row.get("usuario_lancamento_id"),
        "grupo": group or "Sem grupo",
        "categoria": str(category.get("nome") or "Sem categoria") if category else "Sem categoria",
        "conta": str(account.get("nome") or "Sem conta") if account else "Sem conta",
        "usuario": str(user.get("nome") or "Sem usuário") if user else "Sem usuário",
    }


BASE_LANCAMENTO_SELECT = "id,data,valor,descricao,tipo,categoria_id,conta_id,usuario_lancamento_id,ativo"
LEGACY_STATEMENT_SELECT = BASE_LANCAMENTO_SELECT + ",competencia_mes,fatura_periodo_inicio,fatura_periodo_fim,fatura_vencimento"
LANCAMENTO_SELECT = (
    BASE_LANCAMENTO_SELECT
    + ",competencia_mes,fatura_periodo_inicio,fatura_periodo_fim,fatura_vencimento"
    + ",fatura_id"
)


def missing_statement_columns(exc: Exception) -> bool:
    text = str(exc)
    fields = STATEMENT_FIELDS | STATEMENT_CONCILIATION_FIELDS
    return any(field in text for field in fields) and ("does not exist" in text or "PGRST" in text or "42703" in text)


def ensure_statement_columns(db: Supabase) -> None:
    try:
        db.get("fam_lancamentos", {"select": "competencia_mes,fatura_periodo_inicio,fatura_periodo_fim,fatura_vencimento", "limit": "1"})
    except RuntimeError as exc:
        if missing_statement_columns(exc):
            raise RuntimeError(
                "O banco familiar ainda não tem as colunas de fatura. Aplique a migração em "
                "db/financeiro_familiar_schema.sql antes de confirmar fechamentos."
            ) from exc
        raise


def query_lancamentos_for_period(db: Supabase, start: date, end: date) -> list[dict[str, Any]]:
    try:
        with_statement_month = db.get(
            "fam_lancamentos",
            {
                "select": LANCAMENTO_SELECT,
                "ativo": "eq.true",
                "and": f"(competencia_mes.gte.{start.isoformat()},competencia_mes.lte.{end.isoformat()})",
                "order": "data.asc,id.asc",
            },
        )
        without_statement_month = db.get(
            "fam_lancamentos",
            {
                "select": LANCAMENTO_SELECT,
                "ativo": "eq.true",
                "competencia_mes": "is.null",
                "and": f"(data.gte.{start.isoformat()},data.lte.{end.isoformat()})",
                "order": "data.asc,id.asc",
            },
        )
    except RuntimeError as exc:
        if not missing_statement_columns(exc):
            raise
        try:
            with_statement_month = db.get(
                "fam_lancamentos",
                {
                    "select": LEGACY_STATEMENT_SELECT,
                    "ativo": "eq.true",
                    "and": f"(competencia_mes.gte.{start.isoformat()},competencia_mes.lte.{end.isoformat()})",
                    "order": "data.asc,id.asc",
                },
            )
            without_statement_month = db.get(
                "fam_lancamentos",
                {
                    "select": LEGACY_STATEMENT_SELECT,
                    "ativo": "eq.true",
                    "competencia_mes": "is.null",
                    "and": f"(data.gte.{start.isoformat()},data.lte.{end.isoformat()})",
                    "order": "data.asc,id.asc",
                },
            )
        except RuntimeError as legacy_exc:
            if not missing_statement_columns(legacy_exc):
                raise
            with_statement_month = []
            without_statement_month = db.get(
                "fam_lancamentos",
                {
                    "select": BASE_LANCAMENTO_SELECT,
                    "ativo": "eq.true",
                    "and": f"(data.gte.{start.isoformat()},data.lte.{end.isoformat()})",
                    "order": "data.asc,id.asc",
                },
            )
    rows_by_id: dict[int, dict[str, Any]] = {}
    for row in [*with_statement_month, *without_statement_month]:
        try:
            rows_by_id[int(row.get("id"))] = row
        except (TypeError, ValueError):
            continue
    return sorted(rows_by_id.values(), key=lambda item: (str(item.get("data") or ""), int(item.get("id") or 0)))


def query_card_entries_for_statement(db: Supabase, conta_id: int, start: date, end: date) -> list[dict[str, Any]]:
    params = {
        "select": LANCAMENTO_SELECT,
        "ativo": "eq.true",
        "conta_id": f"eq.{conta_id}",
        "fatura_id": "is.null",
        "and": f"(data.gte.{start.isoformat()},data.lte.{end.isoformat()})",
        "order": "data.asc,id.asc",
    }
    try:
        return db.get("fam_lancamentos", params)
    except RuntimeError as exc:
        if not missing_statement_columns(exc):
            raise
        params.pop("fatura_id", None)
        params["select"] = LEGACY_STATEMENT_SELECT
        try:
            return db.get("fam_lancamentos", params)
        except RuntimeError as legacy_exc:
            if not missing_statement_columns(legacy_exc):
                raise
        params["select"] = BASE_LANCAMENTO_SELECT
        return db.get("fam_lancamentos", params)


def query_card_entries_for_statement_check(db: Supabase, conta_id: int, start: date, end: date) -> list[dict[str, Any]]:
    params = {
        "select": LANCAMENTO_SELECT,
        "ativo": "eq.true",
        "conta_id": f"eq.{conta_id}",
        "and": f"(data.gte.{start.isoformat()},data.lte.{end.isoformat()})",
        "order": "data.asc,id.asc",
    }
    try:
        return db.get("fam_lancamentos", params)
    except RuntimeError as exc:
        if not missing_statement_columns(exc):
            raise
        params["select"] = BASE_LANCAMENTO_SELECT
        return db.get("fam_lancamentos", params)


def prepare_statement_close_draft(message: str, db: Supabase, catalog: Catalog) -> dict[str, Any] | None:
    parsed = parse_credit_card_statement_sms(message)
    if not parsed:
        return None
    schema_ready = True
    try:
        ensure_statement_storage(db)
    except RuntimeError as exc:
        if "colunas de fatura" not in str(exc) and "estrutura de conciliação" not in str(exc):
            raise
        schema_ready = False
    account = resolve_account(str(parsed.get("conta_nome") or ""), catalog)
    if not account:
        raise RuntimeError(f"Não encontrei a conta do cartão: {parsed.get('conta_nome')}.")
    conta_id = int(account.get("id") or 0)
    due_date = date.fromisoformat(str(parsed["fatura_vencimento"]))
    card_config = card_config_for_account(db, catalog, conta_id)
    inferred_cycle = None if parsed.get("data_corte_confirmada") else statement_cycle_from_card_config(due_date, card_config)
    last_statement = None
    if inferred_cycle:
        try:
            inferred_end = date.fromisoformat(str(inferred_cycle["fatura_periodo_fim"]))
            last_statement = get_last_closed_statement(db, conta_id, before_period_end=inferred_end)
            inferred_cycle = statement_cycle_from_card_config(due_date, card_config, last_statement=last_statement)
        except ValueError:
            last_statement = None
    configured_cycle = inferred_cycle
    if configured_cycle:
        parsed.update(configured_cycle)
    start = date.fromisoformat(str(parsed["fatura_periodo_inicio"]))
    end = date.fromisoformat(str(parsed["fatura_periodo_fim"]))
    rows = query_card_entries_for_statement(db, conta_id, start, end)
    displays = [row_display(row, catalog) for row in rows]
    found_total = sum((money_to_decimal(row.get("valor")) or Decimal("0.00")) for row in rows)
    statement_total = money_to_decimal(parsed.get("valor_fatura")) or Decimal("0.00")
    difference = statement_total - found_total
    draft = {
        "waiting_for": "fatura_confirmation",
        "conta_id": conta_id,
        "conta_nome": account.get("nome") or parsed.get("conta_nome"),
        "cartao_final": parsed.get("cartao_final") or "",
        "valor_fatura": money_json(statement_total),
        "valor_lancamentos": money_json(found_total),
        "diferenca": money_json(difference),
        "competencia_mes": parsed["competencia_mes"],
        "fatura_periodo_inicio": parsed["fatura_periodo_inicio"],
        "fatura_periodo_fim": parsed["fatura_periodo_fim"],
        "fatura_vencimento": parsed["fatura_vencimento"],
        "data_recebimento": parsed["data_recebimento"],
        "ciclo_fonte": parsed.get("ciclo_fonte") or "sms_recebimento",
        "dia_fechamento": parsed.get("dia_fechamento"),
        "parametros_cartao": card_config or {},
        "ultima_fatura_conciliada": last_statement or {},
        "alerta_vencimento": configured_due_date_warning(due_date, card_config),
        "schema_ready": schema_ready,
        "lancamento_ids": [int(row.get("id")) for row in rows if row.get("id")],
        "previews": displays,
        "_source_text": parsed.get("_source_text") or message,
    }
    return draft


def parse_statement_invoice_items(raw_text: str, start: date, end: date) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for line_number, raw_line in enumerate(str(raw_text or "").splitlines(), 1):
        line = raw_line.strip()
        if not line:
            continue
        cells = [cell.strip() for cell in re.split(r"[\t;|]", line) if cell.strip()]
        if len(cells) < 2:
            cells = [cell.strip() for cell in re.split(r"\s{2,}", line) if cell.strip()]
        if len(cells) < 2:
            match = re.search(r"\b(\d{1,2})\b.+?(-?(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}|-?(?:R\$\s*)?\d+(?:[.,]\d{2})?)", line, flags=re.I)
            if match:
                cells = [match.group(1), match.group(2)]
        if len(cells) < 2:
            if re.search(r"\b(?:dia|data|valor|fatura)\b", norm(line)):
                continue
            raise RuntimeError(f"Não consegui ler a linha {line_number} da fatura: {line}")
        day_match = re.search(r"\b(\d{1,2})(?:/\d{1,2}(?:/\d{2,4})?)?\b", cells[0])
        if not day_match:
            continue
        day = int(day_match.group(1))
        if day < 1 or day > 31:
            raise RuntimeError(f"Dia inválido na linha {line_number}: {cells[0]}")
        value = money_to_decimal(cells[1])
        if value is None:
            raise RuntimeError(f"Valor inválido na linha {line_number}: {cells[1]}")
        possible_dates: list[date] = []
        cursor = start
        while cursor <= end:
            if cursor.day == day:
                possible_dates.append(cursor)
            cursor += timedelta(days=1)
        item_date = possible_dates[0] if possible_dates else None
        items.append(
            {
                "line": line_number,
                "day": day,
                "data": item_date.isoformat() if item_date else "",
                "valor": money_json(value),
                "descricao": cells[2] if len(cells) > 2 else "",
                "raw": line,
            }
        )
    return items


def reconcile_statement_items(rows: list[dict[str, Any]], invoice_items: list[dict[str, Any]]) -> dict[str, Any]:
    if not invoice_items:
        return {}
    internal = [
        {
            "id": int(row.get("id") or 0),
            "data": str(row.get("data") or ""),
            "descricao": row.get("descricao") or "",
            "valor": money_json(row.get("valor")),
            "categoria": row.get("categoria") or "",
        }
        for row in rows
    ]
    unmatched_invoice = set(range(len(invoice_items)))
    unmatched_internal = set(range(len(internal)))
    exact_matches: list[dict[str, Any]] = []
    value_differences: list[dict[str, Any]] = []

    for invoice_index, item in enumerate(invoice_items):
        item_value = money_to_decimal(item.get("valor")) or Decimal("0.00")
        for internal_index in list(unmatched_internal):
            row = internal[internal_index]
            row_value = money_to_decimal(row.get("valor")) or Decimal("0.00")
            if row["data"] == item.get("data") and abs(row_value - item_value) < Decimal("0.005"):
                exact_matches.append({"fatura": item, "lancamento": row})
                unmatched_invoice.discard(invoice_index)
                unmatched_internal.discard(internal_index)
                break

    for invoice_index in list(unmatched_invoice):
        item = invoice_items[invoice_index]
        item_value = money_to_decimal(item.get("valor")) or Decimal("0.00")
        same_day = [idx for idx in unmatched_internal if internal[idx]["data"] == item.get("data")]
        if not same_day:
            continue
        internal_index = min(
            same_day,
            key=lambda idx: abs((money_to_decimal(internal[idx].get("valor")) or Decimal("0.00")) - item_value),
        )
        row = internal[internal_index]
        row_value = money_to_decimal(row.get("valor")) or Decimal("0.00")
        value_differences.append(
            {
                "fatura": item,
                "lancamento": row,
                "diferenca": money_json(item_value - row_value),
            }
        )
        unmatched_invoice.discard(invoice_index)
        unmatched_internal.discard(internal_index)

    return {
        "itens_fatura": len(invoice_items),
        "conferidos": len(exact_matches),
        "divergencias_valor": value_differences,
        "na_fatura_nao_lancados": [invoice_items[idx] for idx in sorted(unmatched_invoice)],
        "lancados_fora_fatura": [internal[idx] for idx in sorted(unmatched_internal, key=lambda idx: (internal[idx]["data"], internal[idx]["id"]))],
    }


def looks_like_statement_check_request(text: str) -> bool:
    clean = norm(text)
    return (
        any(word in clean for word in ["conferir fatura", "conferencia de fatura", "conferencia fatura", "prints da fatura", "print da fatura"])
        or ("fatura" in clean and any(word in clean for word in ["faltando", "faltantes", "divergente", "divergentes", "conferencia", "conferir"]))
    )


def extract_statement_media_paths(text: str) -> list[Path]:
    paths: list[Path] = []
    seen: set[str] = set()
    patterns = [
        r"/root/\.openclaw/media/inbound/[^\s<>'\")]+",
        r"(?:media|midia|mídia|imagem|arquivo)\s*:\s*([^\s<>'\")]+)",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, str(text or ""), flags=re.I):
            raw = match.group(1) if match.lastindex else match.group(0)
            path = Path(raw.strip().strip(".,;"))
            suffix = path.suffix.lower()
            if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
                continue
            if not path.exists() or not path.is_file():
                continue
            key = str(path)
            if key in seen:
                continue
            seen.add(key)
            paths.append(path)
    return paths[:8]


def recent_statement_media_paths(minutes: int = 10) -> list[Path]:
    media_dir = Path("/root/.openclaw/media/inbound")
    if not media_dir.exists():
        return []
    cutoff = datetime.now().timestamp() - minutes * 60
    candidates: list[Path] = []
    try:
        for path in media_dir.iterdir():
            if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                continue
            if not path.is_file():
                continue
            if path.stat().st_mtime >= cutoff:
                candidates.append(path)
    except OSError:
        return []
    return sorted(candidates, key=lambda path: path.stat().st_mtime)[:8]


def ocr_statement_images_with_gemini(paths: list[Path]) -> str:
    if not paths:
        return ""
    load_runtime_env()
    api_key = os.environ.get("GEMINI_API_KEY", "").strip() or os.environ.get("GOOGLE_API_KEY", "").strip()
    if not api_key:
        return ""
    parts: list[dict[str, Any]] = [
        {
            "text": (
                "Extraia de prints de fatura de cartão apenas as linhas de lançamentos. "
                "Cada linha deve ficar no formato: DD/MM DESCRICAO R$ 12,34. "
                "Preserve descrições, datas, valores e parcelas como aparecem. "
                "Ignore cabeçalhos, hora, bateria, botões e saldos. Não explique nada."
            )
        }
    ]
    for path in paths:
        mime = mimetypes.guess_type(str(path))[0] or "image/jpeg"
        try:
            encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        except OSError:
            continue
        parts.append({"inline_data": {"mime_type": mime, "data": encoded}})
    if len(parts) == 1:
        return ""
    try:
        response = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{CATEGORY_GEMINI_MODEL}:generateContent",
            params={"key": api_key},
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"role": "user", "parts": parts}],
                "generationConfig": {
                    "temperature": 0,
                    "maxOutputTokens": 8192,
                    "thinkingConfig": {"thinkingBudget": 0},
                },
            },
            timeout=35,
        )
    except requests.RequestException:
        return ""
    if not response.ok:
        return ""
    output: list[str] = []
    for candidate in response.json().get("candidates") or []:
        content = candidate.get("content") or {}
        for part in content.get("parts") or []:
            text = str(part.get("text") or "").strip()
            if text:
                output.append(text)
    return "\n".join(output).strip()


def infer_statement_account(text: str, catalog: Catalog) -> dict[str, Any] | None:
    clean = norm(text)
    hints: list[str] = []
    if "visa" in clean and "caixa" in clean:
        hints.extend(["Cartão CAIXA Visa", "visa caixa", "visa"])
    elif "elo" in clean and "caixa" in clean:
        hints.extend(["Cartão CAIXA Elo", "elo caixa", "elo"])
    elif "master" in clean and "caixa" in clean:
        hints.extend(["Cartão CAIXA Master", "master caixa", "master"])
    elif "visa" in clean:
        hints.extend(["Cartão CAIXA Visa", "visa"])
    hints.extend(["Cartão CAIXA Visa"])
    for hint in hints:
        account = resolve_account(hint, catalog)
        if account and account.get("tipo") == "cartao_credito":
            return account
    return None


def date_from_invoice_day_month(day: int, month: int, reference: date | None = None) -> date:
    today = reference or business_today()
    year = today.year
    if month > today.month + 1:
        year -= 1
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def parse_statement_ocr_items(text: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    money_pattern = r"(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})"
    for line_number, raw_line in enumerate(str(text or "").splitlines(), 1):
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line:
            continue
        if re.fullmatch(r"\d{1,2}:\d{2}|\d{1,3}", line):
            continue
        clean = norm(line)
        if clean in {"fatura"} or any(word in clean for word in ["gestao financeira", "confirmar fatura"]):
            continue
        match = re.search(rf"\b(\d{{1,2}})/(\d{{1,2}})(?:/(\d{{2,4}}))?\s+(.+?)\s+R?\$?\s*{money_pattern}\s*$", line, flags=re.I)
        if not match:
            continue
        day = int(match.group(1))
        month = int(match.group(2))
        year_raw = match.group(3)
        desc = re.sub(r"\s+", " ", match.group(4)).strip(" -")
        amount = money_to_decimal(match.group(5))
        if amount is None:
            continue
        if year_raw:
            year = int(year_raw)
            if year < 100:
                year += 2000
            item_date = date(year, month, day)
        else:
            item_date = date_from_invoice_day_month(day, month)
        key = (item_date.isoformat(), norm(desc), money_json(amount))
        if key in seen:
            continue
        seen.add(key)
        items.append(
            {
                "line": line_number,
                "day": day,
                "data": item_date.isoformat(),
                "valor": money_json(amount),
                "descricao": desc,
                "raw": line,
            }
        )
    return items


def token_set(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", norm(value))
        if len(token) >= 3 and token not in {"com", "www", "ltda", "digital"}
    }


def description_similarity(left: str, right: str) -> float:
    left_tokens = token_set(left)
    right_tokens = token_set(right)
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def reconcile_statement_ocr_rows(rows: list[dict[str, Any]], invoice_items: list[dict[str, Any]]) -> dict[str, Any]:
    if not invoice_items:
        return {}
    internal = [
        {
            "id": int(row.get("id") or 0),
            "data": str(row.get("data") or ""),
            "descricao": row.get("descricao") or "",
            "valor": money_json(row.get("valor")),
            "categoria": row.get("categoria") or "",
            "conta": row.get("conta") or "",
        }
        for row in rows
    ]
    unmatched_invoice = set(range(len(invoice_items)))
    unmatched_internal = set(range(len(internal)))
    exact_matches: list[dict[str, Any]] = []
    value_differences: list[dict[str, Any]] = []

    for invoice_index, item in enumerate(invoice_items):
        item_value = money_to_decimal(item.get("valor")) or Decimal("0.00")
        for internal_index in list(unmatched_internal):
            row = internal[internal_index]
            row_value = money_to_decimal(row.get("valor")) or Decimal("0.00")
            if row["data"] == item.get("data") and abs(row_value - item_value) < Decimal("0.005"):
                exact_matches.append({"fatura": item, "lancamento": row})
                unmatched_invoice.discard(invoice_index)
                unmatched_internal.discard(internal_index)
                break

    for invoice_index in list(unmatched_invoice):
        item = invoice_items[invoice_index]
        item_value = money_to_decimal(item.get("valor")) or Decimal("0.00")
        same_day = [idx for idx in unmatched_internal if internal[idx]["data"] == item.get("data")]
        if not same_day:
            continue
        candidates = sorted(
            same_day,
            key=lambda idx: (
                -description_similarity(str(item.get("descricao") or ""), str(internal[idx].get("descricao") or "")),
                abs((money_to_decimal(internal[idx].get("valor")) or Decimal("0.00")) - item_value),
            ),
        )
        internal_index = candidates[0]
        row = internal[internal_index]
        row_value = money_to_decimal(row.get("valor")) or Decimal("0.00")
        similarity = description_similarity(str(item.get("descricao") or ""), str(row.get("descricao") or ""))
        if similarity < 0.28:
            continue
        value_differences.append(
            {
                "fatura": item,
                "lancamento": row,
                "diferenca": money_json(item_value - row_value),
                "similaridade": round(similarity, 2),
            }
        )
        unmatched_invoice.discard(invoice_index)
        unmatched_internal.discard(internal_index)

    return {
        "itens_fatura": len(invoice_items),
        "conferidos": len(exact_matches),
        "divergencias_valor": value_differences,
        "na_fatura_nao_lancados": [invoice_items[idx] for idx in sorted(unmatched_invoice, key=lambda idx: (invoice_items[idx]["data"], invoice_items[idx]["line"]))],
        "lancados_fora_fatura": [internal[idx] for idx in sorted(unmatched_internal, key=lambda idx: (internal[idx]["data"], internal[idx]["id"]))],
    }


def statement_check_period(invoice_items: list[dict[str, Any]], account: dict[str, Any], db: Supabase, catalog: Catalog) -> tuple[date, date]:
    dates = [date.fromisoformat(str(item["data"])) for item in invoice_items if item.get("data")]
    if dates:
        return min(dates), max(dates)
    config = card_config_for_account(db, catalog, int(account.get("id") or 0))
    due_date = business_today()
    cycle = statement_cycle_from_card_config(due_date, config)
    if cycle:
        return date.fromisoformat(str(cycle["fatura_periodo_inicio"])), date.fromisoformat(str(cycle["fatura_periodo_fim"]))
    start, end = month_range(due_date.year, due_date.month)
    return start, end


def paste_lines_for_missing(items: list[dict[str, Any]]) -> list[str]:
    lines: list[str] = []
    for item in items:
        value = brl(item.get("valor")).replace("R$ ", "")
        lines.append(f"{item.get('data')}\t{item.get('descricao')}\t{value}\t1")
    return lines


def statement_check_summary(account: dict[str, Any], start: date, end: date, reconciliation: dict[str, Any]) -> str:
    missing = reconciliation.get("na_fatura_nao_lancados") or []
    divergences = reconciliation.get("divergencias_valor") or []
    extra = reconciliation.get("lancados_fora_fatura") or []
    paste_lines = paste_lines_for_missing(missing)
    lines = [
        "🔎 Conferência da fatura",
        f"Cartão: {account.get('nome')}",
        f"Período lido dos prints: {start.isoformat()} a {end.isoformat()}",
        f"Itens lidos: {reconciliation.get('itens_fatura', 0)}",
        f"Já encontrados no sistema: {reconciliation.get('conferidos', 0)}",
        f"Faltando cadastrar: {len(missing)}",
        f"Divergentes prováveis: {len(divergences)}",
        "",
    ]
    if missing:
        lines.append("📥 Texto pronto para colar em Nova transação > Colar linhas do Excel:")
        lines.append("```")
        lines.append("Data\tDescrição\tValor\tParcelas")
        lines.extend(paste_lines[:80])
        lines.append("```")
        if len(paste_lines) > 80:
            lines.append(f"Mostrei as primeiras 80 linhas de {len(paste_lines)} faltantes.")
        lines.append("")
    else:
        lines.append("✅ Não encontrei itens da fatura faltando no sistema.")
        lines.append("")
    if divergences:
        lines.append("⚠️ Divergências prováveis:")
        for item in divergences[:20]:
            invoice = item.get("fatura") or {}
            launch = item.get("lancamento") or {}
            lines.append(
                f"- {invoice.get('data')} {invoice.get('descricao')} {brl(invoice.get('valor'))} "
                f"x #{launch.get('id')} {launch.get('descricao')} {brl(launch.get('valor'))} "
                f"(dif. {brl(item.get('diferenca'))})"
            )
        if len(divergences) > 20:
            lines.append(f"- ... mais {len(divergences) - 20} divergência(s)")
        lines.append("")
    if extra:
        lines.append("ℹ️ Lançamentos internos no período/cartão que não apareceram nos prints:")
        for item in extra[:12]:
            lines.append(f"- #{item.get('id')} · {item.get('data')} · {item.get('descricao')} · {brl(item.get('valor'))}")
        if len(extra) > 12:
            lines.append(f"- ... mais {len(extra) - 12}")
        lines.append("")
    lines.append("Nenhuma gravação foi feita. Esta conferência é apenas informativa.")
    return "\n".join(lines).strip()


def prepare_statement_check_report(message: str, db: Supabase, catalog: Catalog) -> dict[str, Any] | None:
    if not looks_like_statement_check_request(message):
        return None
    media_paths = extract_statement_media_paths(message)
    if not media_paths:
        media_paths = recent_statement_media_paths()
    ocr_text = ocr_statement_images_with_gemini(media_paths)
    source_text = f"{message}\n{ocr_text}" if ocr_text else message
    invoice_items = parse_statement_ocr_items(source_text)
    if not invoice_items:
        if media_paths:
            return {
                "action": "statement_check",
                "message": (
                    "Recebi os prints da fatura, mas o OCR não conseguiu extrair linhas de lançamentos. "
                    "Tente reenviar imagens mais nítidas ou cole a transcrição no formato DD/MM DESCRIÇÃO R$ 12,34.\n\n"
                    "Nenhuma gravação foi feita. Esta conferência é apenas informativa."
                ),
                "items_read": 0,
                "media_files": [str(path) for path in media_paths],
            }
        return {
            "action": "statement_check",
            "message": "Não consegui ler lançamentos de fatura no texto recebido. Envie os prints com OCR/transcrição ou cole o texto da fatura com linhas no formato DD/MM DESCRIÇÃO R$ 12,34.",
            "items_read": 0,
        }
    account = infer_statement_account(source_text, catalog)
    if not account:
        raise RuntimeError("Não consegui identificar o cartão da fatura. Diga, por exemplo: conferir fatura do Cartão CAIXA Visa.")
    start, end = statement_check_period(invoice_items, account, db, catalog)
    rows = query_card_entries_for_statement_check(db, int(account.get("id") or 0), start, end)
    displays = [row_display(row, catalog) for row in rows]
    reconciliation = reconcile_statement_ocr_rows(displays, invoice_items)
    return {
        "action": "statement_check",
        "message": statement_check_summary(account, start, end, reconciliation),
        "account": account.get("nome"),
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "items_read": len(invoice_items),
        "media_files": [str(path) for path in media_paths],
        "reconciliation": reconciliation,
    }


def prepare_dashboard_statement_close_draft(raw: dict[str, Any], db: Supabase, catalog: Catalog) -> dict[str, Any]:
    schema_ready = True
    try:
        ensure_statement_storage(db)
    except RuntimeError as exc:
        if "colunas de fatura" not in str(exc) and "estrutura de conciliação" not in str(exc):
            raise
        schema_ready = False
    try:
        conta_id = int(raw.get("conta_id") or 0)
    except (TypeError, ValueError) as exc:
        raise RuntimeError("Cartão inválido para fechamento de fatura.") from exc
    accounts = {int(account.get("id") or 0): account for account in catalog.contas}
    account = accounts.get(conta_id)
    if not account or account.get("tipo") != "cartao_credito":
        raise RuntimeError("Selecione uma conta do tipo cartão de crédito.")
    try:
        due_date = date.fromisoformat(str(raw.get("fatura_vencimento") or ""))
    except ValueError as exc:
        raise RuntimeError("Vencimento da fatura inválido.") from exc
    statement_total = money_to_decimal(raw.get("valor_fatura"))
    if statement_total is None or statement_total <= 0:
        raise RuntimeError("Informe o valor total da fatura.")
    card_config = card_config_for_account(db, catalog, conta_id)
    last_statement = None
    cycle = statement_cycle_from_card_config(due_date, card_config)
    if cycle:
        try:
            inferred_end = date.fromisoformat(str(cycle["fatura_periodo_fim"]))
            last_statement = get_last_closed_statement(db, conta_id, before_period_end=inferred_end)
            cycle = statement_cycle_from_card_config(due_date, card_config, last_statement=last_statement)
        except ValueError:
            last_statement = None
    if not cycle:
        cycle = {
            "fatura_periodo_inicio": "",
            "fatura_periodo_fim": "",
            "competencia_mes": date(due_date.year, due_date.month, 1).isoformat(),
            "ciclo_fonte": "dashboard_manual",
            "dia_fechamento": "",
        }
    start_raw = str(raw.get("fatura_periodo_inicio") or cycle.get("fatura_periodo_inicio") or "")
    end_raw = str(raw.get("fatura_periodo_fim") or cycle.get("fatura_periodo_fim") or "")
    try:
        start = date.fromisoformat(start_raw)
        end = date.fromisoformat(end_raw)
    except ValueError as exc:
        raise RuntimeError("Período de compras inválido.") from exc
    if end < start:
        raise RuntimeError("O fim do período da fatura não pode vir antes do início.")
    if (end - start).days > 70:
        raise RuntimeError("Período da fatura ficou longo demais. Revise as datas antes de confirmar.")
    rows = query_card_entries_for_statement(db, conta_id, start, end)
    selected_ids = raw.get("lancamento_ids")
    if isinstance(selected_ids, list) and selected_ids:
        selected = {int(item) for item in selected_ids if str(item).strip().isdigit()}
        rows = [row for row in rows if int(row.get("id") or 0) in selected]
    displays = [row_display(row, catalog) for row in rows]
    found_total = sum((money_to_decimal(row.get("valor")) or Decimal("0.00")) for row in rows)
    difference = statement_total - found_total
    invoice_items = parse_statement_invoice_items(str(raw.get("itens_fatura") or ""), start, end)
    item_reconciliation = reconcile_statement_items(displays, invoice_items)
    return {
        "waiting_for": "fatura_confirmation",
        "conta_id": conta_id,
        "conta_nome": account.get("nome") or "",
        "cartao_final": str(card_config.get("final_cartao") or "") if isinstance(card_config, dict) else "",
        "valor_fatura": money_json(statement_total),
        "valor_lancamentos": money_json(found_total),
        "diferenca": money_json(difference),
        "competencia_mes": date(due_date.year, due_date.month, 1).isoformat(),
        "fatura_periodo_inicio": start.isoformat(),
        "fatura_periodo_fim": end.isoformat(),
        "fatura_vencimento": due_date.isoformat(),
        "data_recebimento": business_today().isoformat(),
        "ciclo_fonte": str(cycle.get("ciclo_fonte") or "dashboard_manual"),
        "dia_fechamento": cycle.get("dia_fechamento"),
        "parametros_cartao": card_config or {},
        "ultima_fatura_conciliada": last_statement or {},
        "alerta_vencimento": configured_due_date_warning(due_date, card_config),
        "schema_ready": schema_ready,
        "lancamento_ids": [int(row.get("id")) for row in rows if row.get("id")],
        "previews": displays,
        "itens_fatura": invoice_items,
        "conferencia_fatura": item_reconciliation,
        "_source_text": "dashboard",
    }


def statement_close_summary(draft: dict[str, Any]) -> str:
    previews = draft.get("previews") if isinstance(draft.get("previews"), list) else []
    difference = money_to_decimal(draft.get("diferenca")) or Decimal("0.00")
    lines = [
        "✅ Confirma o fechamento desta fatura?",
        "",
        f"Cartão: {draft.get('conta_nome')}" + (f" final {draft.get('cartao_final')}" if draft.get("cartao_final") else ""),
        f"Competência: {date.fromisoformat(str(draft.get('competencia_mes'))).strftime('%m/%Y')}",
        f"Período de compras: {draft.get('fatura_periodo_inicio')} a {draft.get('fatura_periodo_fim')}",
        "Fonte do ciclo: data de corte confirmada"
        if draft.get("ciclo_fonte") == "data_corte_confirmada"
        else (
            "Fonte do ciclo: última fatura conciliada + parâmetros do cartão"
            if draft.get("ciclo_fonte") == "ultima_fatura_conciliada"
            else ("Fonte do ciclo: parâmetros cadastrados do cartão" if draft.get("ciclo_fonte") == "parametros_cartao" else "Fonte do ciclo: data de recebimento do SMS")
        ),
        f"Vencimento: {draft.get('fatura_vencimento')}",
        f"Valor informado pela CAIXA: {brl(draft.get('valor_fatura'))}",
        f"Lançamentos encontrados: {len(previews)}",
        f"Soma dos lançamentos: {brl(draft.get('valor_lancamentos'))}",
        f"Diferença: {brl(difference)}",
        "",
    ]
    if difference != Decimal("0.00"):
        lines.append("⚠️ A soma encontrada não bate com o SMS. Você pode confirmar mesmo assim, mas vale revisar a fatura no app.")
        lines.append("")
    if draft.get("alerta_vencimento"):
        lines.append(f"⚠️ {draft.get('alerta_vencimento')}")
        lines.append("")
    if draft.get("schema_ready") is False:
        lines.append("⚠️ O banco vivo ainda precisa receber a migração de conciliação de faturas antes do SIM funcionar.")
        lines.append("")
    lines.append("Lançamentos que serão marcados:")
    for item in previews[:15]:
        lines.append(f"- #{item.get('id')} · {item.get('data')} · {item.get('descricao')} · {brl(item.get('valor'))} · {item.get('categoria')}")
    if len(previews) > 15:
        lines.append(f"- ... mais {len(previews) - 15} lançamento(s)")
    if not previews:
        lines.append("- Nenhum lançamento encontrado nesse período/cartão.")
    lines.extend(["", "✅ SIM cria a fatura conciliada e marca os lançamentos. ❌ NAO cancela."])
    return "\n".join(lines)


CARD_CONFIG_SELECT = (
    "id,conta_id,bandeira,final_cartao,apelidos,dia_fechamento,dia_vencimento,"
    "tolerancia_diferenca,regra_ciclo,ativo,updated_at"
)


def card_config_table_missing(exc: Exception) -> bool:
    text = str(exc)
    return "fam_cartao_parametros" in text and ("does not exist" in text or "PGRST" in text or "42P01" in text)


def default_card_config_for_account(account: dict[str, Any]) -> dict[str, Any]:
    name = str(account.get("nome") or "")
    clean = norm(name)
    brand = ""
    if "visa" in clean:
        brand = "Visa"
    elif "master" in clean:
        brand = "Master"
    elif "elo" in clean:
        brand = "Elo"
    return {
        "id": None,
        "conta_id": account.get("id"),
        "conta_nome": name,
        "bandeira": brand,
        "final_cartao": "",
        "apelidos": [],
        "dia_fechamento": None,
        "dia_vencimento": None,
        "tolerancia_diferenca": "10.00",
        "regra_ciclo": "fechamento_mensal",
        "ativo": True,
        "configured": False,
    }


def list_card_configs(db: Supabase, catalog: Catalog) -> dict[str, Any]:
    card_accounts = [account for account in catalog.contas if str(account.get("tipo") or "") == "cartao_credito"]
    defaults = {int(account.get("id") or 0): default_card_config_for_account(account) for account in card_accounts}
    try:
        rows = db.get(
            "fam_cartao_parametros",
            {
                "select": CARD_CONFIG_SELECT,
                "order": "conta_id.asc",
            },
        )
    except RuntimeError as exc:
        if not card_config_table_missing(exc):
            raise
        return {
            "schema_ready": False,
            "message": "A tabela fam_cartao_parametros ainda não existe no Supabase vivo. Aplique a migração antes de salvar parâmetros.",
            "items": list(defaults.values()),
        }
    for row in rows:
        try:
            conta_id = int(row.get("conta_id") or 0)
        except (TypeError, ValueError):
            continue
        item = defaults.get(conta_id, {"conta_id": conta_id, "conta_nome": f"Conta #{conta_id}"})
        item.update(
            {
                "id": row.get("id"),
                "bandeira": row.get("bandeira") or "",
                "final_cartao": row.get("final_cartao") or "",
                "apelidos": row.get("apelidos") if isinstance(row.get("apelidos"), list) else [],
                "dia_fechamento": row.get("dia_fechamento"),
                "dia_vencimento": row.get("dia_vencimento"),
                "tolerancia_diferenca": money_json(row.get("tolerancia_diferenca")),
                "regra_ciclo": row.get("regra_ciclo") or "fechamento_mensal",
                "ativo": bool(row.get("ativo", True)),
                "configured": True,
                "updated_at": row.get("updated_at"),
            }
        )
        defaults[conta_id] = item
    return {"schema_ready": True, "message": "", "items": list(defaults.values())}


def card_config_for_account(db: Supabase, catalog: Catalog, conta_id: int) -> dict[str, Any] | None:
    configs = list_card_configs(db, catalog)
    for item in configs.get("items") or []:
        if not isinstance(item, dict):
            continue
        try:
            item_conta_id = int(item.get("conta_id") or 0)
        except (TypeError, ValueError):
            continue
        if item_conta_id == conta_id and item.get("configured") and item.get("ativo", True):
            return item
    return None


def statement_cycle_from_card_config(
    due_date: date,
    config: dict[str, Any] | None,
    last_statement: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if not config or not config.get("dia_fechamento"):
        return None
    try:
        closing_day = int(config.get("dia_fechamento") or 0)
    except (TypeError, ValueError):
        return None
    if closing_day < 1 or closing_day > 31:
        return None
    period_end = date_with_clamped_day(due_date.year, due_date.month, closing_day)
    if period_end >= due_date:
        period_end = date.fromisoformat(add_months(period_end.isoformat(), -1))
    previous_close = date.fromisoformat(add_months(period_end.isoformat(), -1))
    period_start = previous_close + timedelta(days=1)
    if last_statement:
        try:
            last_period_end = date.fromisoformat(str(last_statement.get("periodo_fim") or ""))
        except ValueError:
            last_period_end = None
        if last_period_end and last_period_end < period_end:
            period_start = last_period_end + timedelta(days=1)
    return {
        "fatura_periodo_inicio": period_start.isoformat(),
        "fatura_periodo_fim": period_end.isoformat(),
        "competencia_mes": date(due_date.year, due_date.month, 1).isoformat(),
        "ciclo_fonte": "ultima_fatura_conciliada" if last_statement else "parametros_cartao",
        "dia_fechamento": closing_day,
    }


def configured_due_date_warning(due_date: date, config: dict[str, Any] | None) -> str:
    if not config or not config.get("dia_vencimento"):
        return ""
    try:
        configured_day = int(config.get("dia_vencimento") or 0)
    except (TypeError, ValueError):
        return ""
    if configured_day < 1 or configured_day > 31:
        return ""
    expected_due = date_with_clamped_day(due_date.year, due_date.month, configured_day)
    if expected_due == due_date:
        return ""
    return f"Vencimento do SMS ({due_date.isoformat()}) difere do dia cadastrado do cartão ({expected_due.isoformat()}). Vou usar o vencimento informado no SMS para esta fatura."


def validate_card_config_payload(raw: dict[str, Any], catalog: Catalog) -> dict[str, Any]:
    accounts = {int(account.get("id") or 0): account for account in catalog.contas}
    try:
        conta_id = int(raw.get("conta_id") or 0)
    except (TypeError, ValueError) as exc:
        raise RuntimeError("Conta de cartão inválida.") from exc
    account = accounts.get(conta_id)
    if not account or str(account.get("tipo") or "") != "cartao_credito":
        raise RuntimeError("Parâmetros só podem ser cadastrados para contas de cartão de crédito.")

    def optional_day(key: str) -> int | None:
        value = raw.get(key)
        if value in (None, ""):
            return None
        try:
            day = int(value)
        except (TypeError, ValueError) as exc:
            raise RuntimeError(f"{key} inválido.") from exc
        if day < 1 or day > 31:
            raise RuntimeError(f"{key} precisa ficar entre 1 e 31.")
        return day

    aliases = raw.get("apelidos")
    if isinstance(aliases, str):
        aliases = [item.strip() for item in re.split(r"[,;\n]", aliases) if item.strip()]
    elif isinstance(aliases, list):
        aliases = [str(item).strip() for item in aliases if str(item).strip()]
    else:
        aliases = []
    tolerance = money_to_decimal(raw.get("tolerancia_diferenca"))
    if tolerance is None:
        tolerance = Decimal("10.00")
    if tolerance < 0:
        raise RuntimeError("Tolerância de diferença não pode ser negativa.")
    final_card = re.sub(r"\D+", "", str(raw.get("final_cartao") or ""))[:4]
    return {
        "conta_id": conta_id,
        "bandeira": str(raw.get("bandeira") or "").strip()[:40],
        "final_cartao": final_card,
        "apelidos": aliases[:12],
        "dia_fechamento": optional_day("dia_fechamento"),
        "dia_vencimento": optional_day("dia_vencimento"),
        "tolerancia_diferenca": money_json(tolerance),
        "regra_ciclo": str(raw.get("regra_ciclo") or "fechamento_mensal").strip()[:60] or "fechamento_mensal",
        "ativo": bool(raw.get("ativo", True)),
        "updated_at": datetime.now(ZoneInfo(BUSINESS_TIMEZONE)).isoformat(),
    }


def save_card_config(db: Supabase, catalog: Catalog, raw: dict[str, Any]) -> dict[str, Any]:
    payload = validate_card_config_payload(raw, catalog)
    try:
        existing = db.get(
            "fam_cartao_parametros",
            {
                "select": "id",
                "conta_id": f"eq.{payload['conta_id']}",
                "limit": "1",
            },
        )
    except RuntimeError as exc:
        if card_config_table_missing(exc):
            raise RuntimeError("A tabela fam_cartao_parametros ainda não existe no Supabase vivo. Aplique a migração antes de salvar parâmetros.") from exc
        raise
    if existing:
        records = db.patch("fam_cartao_parametros", payload, {"id": f"eq.{existing[0].get('id')}"})
    else:
        records = db.post("fam_cartao_parametros", payload)
    return {"action": "card_config_saved", "message": "Parâmetros do cartão salvos.", "records": records}


def invalidate_catalog_cache() -> None:
    try:
        CATALOG_CACHE_PATH.unlink(missing_ok=True)
    except Exception:
        pass


def list_accounts_admin(db: Supabase, catalog: Catalog) -> dict[str, Any]:
    accounts = db.get(
        "fam_contas",
        {"select": "id,nome,tipo,titular_usuario_id,ativa", "order": "id.asc"},
    )
    users = db.get(
        "fam_usuarios",
        {"select": "id,nome,ativo", "order": "id.asc"},
    )
    usage_rows = db.get(
        "fam_lancamentos",
        {"select": "conta_id,valor", "ativo": "eq.true"},
    )
    usage: dict[int, dict[str, Decimal | int]] = {}
    for row in usage_rows:
        try:
            account_id = int(row.get("conta_id") or 0)
        except (TypeError, ValueError):
            continue
        item = usage.setdefault(account_id, {"count": 0, "total": Decimal("0.00")})
        item["count"] = int(item["count"]) + 1
        item["total"] = item["total"] + (money_to_decimal(row.get("valor")) or Decimal("0.00"))  # type: ignore[operator]
    configs = {int(item.get("conta_id") or 0): item for item in list_card_configs(db, catalog).get("items") or [] if isinstance(item, dict)}
    user_names = {int(user.get("id") or 0): str(user.get("nome") or "") for user in users}
    return {
        "action": "accounts",
        "users": [
            {"id": user.get("id"), "nome": user.get("nome") or "", "ativo": bool(user.get("ativo", True))}
            for user in users
        ],
        "items": [
            {
                "id": account.get("id"),
                "nome": account.get("nome") or "",
                "tipo": account.get("tipo") or "conta_corrente",
                "titular_usuario_id": account.get("titular_usuario_id"),
                "titular": user_names.get(int(account.get("titular_usuario_id") or 0), ""),
                "ativa": bool(account.get("ativa", True)),
                "usage_count": int(usage.get(int(account.get("id") or 0), {}).get("count", 0)),
                "usage_total": money_json(usage.get(int(account.get("id") or 0), {}).get("total", Decimal("0.00"))),
                "card": configs.get(int(account.get("id") or 0), {}),
            }
            for account in accounts
        ],
    }


def validate_account_payload(raw: dict[str, Any], catalog: Catalog) -> dict[str, Any]:
    name = re.sub(r"\s+", " ", str(raw.get("nome") or "").strip())
    if len(name) < 2:
        raise RuntimeError("Nome da conta é obrigatório.")
    if len(name) > 90:
        raise RuntimeError("Nome da conta ficou longo demais.")
    account_type = str(raw.get("tipo") or "conta_corrente").strip()
    if account_type not in {"caixa", "cartao_credito", "conta_corrente", "poupanca"}:
        raise RuntimeError("Tipo de conta inválido.")
    user_id_raw = raw.get("titular_usuario_id")
    user_id = None
    if user_id_raw not in (None, ""):
        try:
            user_id = int(user_id_raw)
        except (TypeError, ValueError) as exc:
            raise RuntimeError("Titular inválido.") from exc
        users = {int(user.get("id") or 0): user for user in catalog.usuarios}
        if user_id not in users:
            raise RuntimeError("Titular não encontrado.")
    return {
        "nome": name,
        "tipo": account_type,
        "titular_usuario_id": user_id,
        "ativa": bool(raw.get("ativa", True)),
    }


def save_account_admin(db: Supabase, catalog: Catalog, raw: dict[str, Any]) -> dict[str, Any]:
    payload = validate_account_payload(raw, catalog)
    raw_id = raw.get("id")
    if raw_id in (None, ""):
        records = db.post("fam_contas", payload)
        account_id = int(records[0].get("id") or 0)
        message = "Conta criada."
    else:
        try:
            account_id = int(raw_id)
        except (TypeError, ValueError) as exc:
            raise RuntimeError("Conta inválida.") from exc
        existing = db.get("fam_contas", {"select": "id", "id": f"eq.{account_id}", "limit": "1"})
        if not existing:
            raise RuntimeError("Conta não encontrada.")
        records = db.patch("fam_contas", payload, {"id": f"eq.{account_id}"})
        message = "Conta salva."
    if payload["tipo"] == "cartao_credito":
        card_payload = dict(raw.get("card") or {})
        card_payload["conta_id"] = account_id
        for account in catalog.contas:
            if int(account.get("id") or 0) == account_id:
                account.update({"nome": payload["nome"], "tipo": payload["tipo"], "titular_usuario_id": payload["titular_usuario_id"], "ativa": payload["ativa"]})
                break
        else:
            catalog.contas.append({"id": account_id, "nome": payload["nome"], "tipo": payload["tipo"], "titular_usuario_id": payload["titular_usuario_id"], "ativa": payload["ativa"]})
        save_card_config(db, catalog, card_payload)
    else:
        try:
            existing_card = db.get("fam_cartao_parametros", {"select": "id", "conta_id": f"eq.{account_id}", "limit": "1"})
            if existing_card:
                db.patch("fam_cartao_parametros", {"ativo": False, "updated_at": datetime.now(ZoneInfo(BUSINESS_TIMEZONE)).isoformat()}, {"id": f"eq.{existing_card[0].get('id')}"})
        except RuntimeError as exc:
            if not card_config_table_missing(exc):
                raise
    invalidate_catalog_cache()
    return {"action": "account_saved", "message": message, "records": records}


def list_categories_admin(db: Supabase, catalog: Catalog) -> dict[str, Any]:
    groups = db.get(
        "fam_categoria_grupos",
        {"select": "id,nome,ordem,ativo", "order": "ordem.asc,nome.asc"},
    )
    categories = db.get(
        "fam_categorias",
        {"select": "id,grupo_id,nome,tipo_padrao,palavras_chave,ativa", "order": "grupo_id.asc,nome.asc"},
    )
    usage_rows = db.get(
        "fam_lancamentos",
        {"select": "categoria_id,valor", "ativo": "eq.true"},
    )
    usage: dict[int, dict[str, Decimal | int]] = {}
    for row in usage_rows:
        try:
            category_id = int(row.get("categoria_id") or 0)
        except (TypeError, ValueError):
            continue
        item = usage.setdefault(category_id, {"count": 0, "total": Decimal("0.00")})
        item["count"] = int(item["count"]) + 1
        item["total"] = item["total"] + (money_to_decimal(row.get("valor")) or Decimal("0.00"))  # type: ignore[operator]
    group_names = {int(group.get("id") or 0): str(group.get("nome") or "") for group in groups}
    return {
        "action": "categories",
        "groups": [
            {
                "id": group.get("id"),
                "nome": group.get("nome") or "",
                "ordem": group.get("ordem") or 0,
                "ativo": bool(group.get("ativo", True)),
            }
            for group in groups
        ],
        "items": [
            {
                "id": category.get("id"),
                "grupo_id": category.get("grupo_id"),
                "grupo": group_names.get(int(category.get("grupo_id") or 0), ""),
                "nome": category.get("nome") or "",
                "tipo_padrao": category.get("tipo_padrao") or "variavel",
                "palavras_chave": category.get("palavras_chave") if isinstance(category.get("palavras_chave"), list) else [],
                "ativa": bool(category.get("ativa", True)),
                "usage_count": int(usage.get(int(category.get("id") or 0), {}).get("count", 0)),
                "usage_total": money_json(usage.get(int(category.get("id") or 0), {}).get("total", Decimal("0.00"))),
            }
            for category in categories
        ],
    }


def validate_category_payload(raw: dict[str, Any], catalog: Catalog) -> dict[str, Any]:
    try:
        group_id = int(raw.get("grupo_id") or 0)
    except (TypeError, ValueError) as exc:
        raise RuntimeError("Grupo inválido.") from exc
    groups = {int(group.get("id") or 0): group for group in catalog.grupos}
    if group_id not in groups:
        raise RuntimeError("Grupo de categoria não encontrado.")
    name = re.sub(r"\s+", " ", str(raw.get("nome") or "").strip())
    if len(name) < 2:
        raise RuntimeError("Nome da categoria é obrigatório.")
    if len(name) > 80:
        raise RuntimeError("Nome da categoria ficou longo demais.")
    category_type = str(raw.get("tipo_padrao") or "variavel").strip()
    if category_type not in {"fixo", "variavel", "projeto"}:
        raise RuntimeError("Tipo padrão inválido.")
    keywords = raw.get("palavras_chave")
    if isinstance(keywords, str):
        keywords = [item.strip() for item in re.split(r"[,;\n]", keywords) if item.strip()]
    elif isinstance(keywords, list):
        keywords = [str(item).strip() for item in keywords if str(item).strip()]
    else:
        keywords = []
    normalized_keywords: list[str] = []
    seen: set[str] = set()
    for keyword in keywords:
        keyword = re.sub(r"\s+", " ", keyword)[:60]
        key = norm(keyword)
        if keyword and key not in seen:
            seen.add(key)
            normalized_keywords.append(keyword)
    return {
        "grupo_id": group_id,
        "nome": name,
        "tipo_padrao": category_type,
        "palavras_chave": normalized_keywords[:20],
        "ativa": bool(raw.get("ativa", True)),
    }


def save_category_admin(db: Supabase, catalog: Catalog, raw: dict[str, Any]) -> dict[str, Any]:
    payload = validate_category_payload(raw, catalog)
    raw_id = raw.get("id")
    if raw_id in (None, ""):
        records = db.post("fam_categorias", payload)
        invalidate_catalog_cache()
        return {"action": "category_saved", "message": "Categoria criada.", "records": records}
    try:
        category_id = int(raw_id)
    except (TypeError, ValueError) as exc:
        raise RuntimeError("Categoria inválida.") from exc
    existing = db.get("fam_categorias", {"select": "id", "id": f"eq.{category_id}", "limit": "1"})
    if not existing:
        raise RuntimeError("Categoria não encontrada.")
    records = db.patch("fam_categorias", payload, {"id": f"eq.{category_id}"})
    invalidate_catalog_cache()
    return {"action": "category_saved", "message": "Categoria salva.", "records": records}


def dashboard_dataset(db: Supabase, catalog: Catalog, start: date, end: date, label: str, telegram_chat_id: str = "") -> dict[str, Any]:
    year_start = date(start.year, 1, 1)
    year_end = date(start.year, 12, 31)
    reference_month = start.replace(day=1)
    dashboard_months = [date.fromisoformat(add_months(reference_month.isoformat(), offset)) for offset in range(-1, 5)]
    table_start = dashboard_months[0]
    table_end = month_range(dashboard_months[-1].year, dashboard_months[-1].month)[1]
    loaded_start = min(year_start, table_start)
    loaded_end = max(year_end, table_end)
    rows = query_lancamentos_for_period(db, loaded_start, loaded_end)
    return {
        "title": f"Gestão Financeira - {label}",
        "defaultStart": start.isoformat(),
        "defaultEnd": end.isoformat(),
        "loadedStart": loaded_start.isoformat(),
        "loadedEnd": loaded_end.isoformat(),
        "dashboardMonths": [{"key": item.strftime("%Y-%m"), "label": item.strftime("%m/%Y")} for item in dashboard_months],
        "generatedAt": datetime.now(ZoneInfo(BUSINESS_TIMEZONE)).strftime("%Y-%m-%d %H:%M"),
        "telegramChatId": normalize_telegram_target(telegram_chat_id),
        "categories": [
            {
                "id": category.get("id"),
                "label": category_label(category, catalog),
                "grupo": group_name(catalog, category.get("grupo_id")) or "",
                "nome": category.get("nome") or "",
                "tipo": category.get("tipo_padrao") or "variavel",
            }
            for category in sorted(catalog.categorias, key=lambda item: category_label(item, catalog))
        ],
        "accounts": [
            {
                "id": account.get("id"),
                "nome": account.get("nome") or "",
                "tipo": account.get("tipo") or "",
            }
            for account in sorted(catalog.contas, key=lambda item: str(item.get("nome") or ""))
        ],
        "users": [
            {
                "id": user.get("id"),
                "nome": user.get("nome") or "",
            }
            for user in sorted(catalog.usuarios, key=lambda item: str(item.get("nome") or ""))
        ],
        "cardConfigs": list_card_configs(db, catalog),
        "transactions": [row_display(row, catalog) for row in rows],
    }


def dashboard_html(dataset: dict[str, Any]) -> str:
    data_json = json.dumps(dataset, ensure_ascii=False).replace("</", "<\\/")
    title = html_lib.escape(str(dataset.get("title") or "Dashboard financeiro familiar"))
    return (
        """<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>__TITLE__</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f8fb;
      --panel: #ffffff;
      --ink: #172033;
      --muted: #657084;
      --line: #dce3ec;
      --nav: #062b38;
      --accent: #0d7a6f;
      --teal: #34d1bf;
      --yellow: #facc15;
      --red: #ff5d63;
      --blue: #2563eb;
      --danger: #b42318;
      --edited: #fff7d6;
      --edited-line: #f2c94c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13px;
      background: var(--bg);
      color: var(--ink);
    }
    .app-shell {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 218px minmax(0, 1fr);
    }
    .sidebar {
      background: var(--nav);
      color: #d8f8f5;
      display: flex;
      flex-direction: column;
      min-width: 0;
      border-right: 1px solid rgba(255,255,255,.08);
      background-image: linear-gradient(180deg, rgba(12, 64, 94, .95), rgba(6, 43, 56, .98));
    }
    .brand { display: flex; align-items: center; gap: 10px; min-height: 58px; padding: 0 16px; font-size: 15px; font-weight: 750; white-space: nowrap; border-bottom: 1px solid rgba(255,255,255,.16); }
    .brand-mark {
      width: 28px;
      height: 28px;
      border: 2px solid var(--teal);
      border-radius: 50%;
      display: grid;
      place-items: center;
      color: var(--teal);
      font-weight: 900;
    }
    .nav-search { display: none; padding: 12px 12px 10px; border-bottom: 1px solid rgba(255,255,255,.12); }
    .nav-search input { width: 100%; min-height: 34px; border-color: rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: #fff; }
    .nav-search input::placeholder { color: rgba(255,255,255,.68); }
    .nav-steps { display: grid; gap: 2px; padding: 10px 8px; font-size: 13px; font-weight: 600; white-space: nowrap; }
    .nav-steps button {
      border: 0;
      background: transparent;
      color: inherit;
      opacity: .86;
      font: inherit;
      text-align: left;
      padding: 9px 12px;
      min-height: 36px;
      border-radius: 4px;
    }
    .nav-steps button[disabled] { cursor: default; opacity: .42; }
    .nav-steps .active {
      opacity: 1;
      color: #fff;
      background: rgba(255,255,255,.12);
      box-shadow: inset 3px 0 0 var(--teal);
    }
    .content { min-width: 0; }
    .topbar {
      min-height: 46px;
      padding: 0 clamp(16px, 2vw, 26px);
      border-bottom: 1px solid var(--line);
      background: var(--panel);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
    }
    .topbar-user { color: var(--muted); font-size: 12px; white-space: nowrap; }
    .dashboard-head {
      padding: 12px clamp(16px, 2vw, 26px);
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 24px;
      align-items: end;
      background: var(--panel);
      border-bottom: 1px solid var(--line);
    }
    h1 { margin: 0 0 4px; font-size: 18px; line-height: 1.18; letter-spacing: 0; }
    .page-title { display: none; }
    .page-meta { font-weight: 650; }
    .muted { color: var(--muted); }
    main { padding: 16px clamp(12px, 2vw, 26px) 28px; }
    .screen[hidden] { display: none; }
    .section-panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px 20px 20px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    .section-panel h2 { margin: 0; font-size: 16px; letter-spacing: 0; }
    .config-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
    .account-admin { display: grid; gap: 12px; margin-top: 14px; }
    .accounts-toolbar { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
    .account-admin-form {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) minmax(180px, 220px) minmax(170px, 220px) minmax(120px, 160px) 120px;
      gap: 10px;
      align-items: end;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfcfe;
    }
    .account-admin-table-wrap {
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow-x: auto;
      background: #fff;
    }
    .account-admin-table { min-width: 1180px; table-layout: fixed; }
    .account-admin-table th, .account-admin-table td { vertical-align: middle; }
    .account-admin-table input, .account-admin-table select { min-height: 32px; padding: 6px 8px; }
    .account-admin-table th:nth-child(1) { width: 240px; }
    .account-admin-table th:nth-child(2) { width: 150px; }
    .account-admin-table th:nth-child(3) { width: 130px; }
    .account-admin-table th:nth-child(4) { width: 110px; }
    .account-admin-table th:nth-child(5) { width: 150px; }
    .account-admin-table th:nth-child(6) { width: 120px; }
    .account-admin-table th:nth-child(7), .account-admin-table th:nth-child(8), .account-admin-table th:nth-child(9), .account-admin-table th:nth-child(10) { width: 86px; }
    .account-admin-table th:nth-child(11) { width: 160px; }
    .account-admin-table .account-name-field { min-width: 0; }
    .account-admin-table .alias-field { min-width: 0; }
    .account-admin-table .compact-field { min-width: 0; }
    .account-admin-table .usage-cell { white-space: nowrap; color: var(--muted); font-weight: 700; }
    .account-admin-table tr.changed { background: var(--edited); box-shadow: inset 4px 0 0 var(--edited-line); }
    .account-admin-table tr.inactive:not(.changed) { background: #f8fafc; color: var(--muted); }
    .account-admin-table tr:not(.credit-card) .card-only { opacity: .35; }
    .account-admin-table tr:not(.credit-card) .card-only input { pointer-events: none; background: #f8fafc; }
    .account-admin-table select[data-account-field="tipo"],
    .account-admin-table select[data-account-field="titular_usuario_id"],
    .account-admin-table select[data-account-field="ativa"] {
      background-position: right 8px center;
      padding-right: 24px;
    }
    .account-row-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-width: 118px; }
    .account-save-button {
      min-width: 88px;
      background: #f8fafc;
      color: var(--muted);
      border-color: var(--line);
    }
    .account-save-button.dirty {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }
    .config-message { margin: 10px 0 0; color: var(--muted); }
    .config-message.warn { color: var(--danger); font-weight: 700; }
    .config-message.ok { color: var(--accent); font-weight: 700; }
    .category-tools {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) minmax(180px, 260px);
      gap: 12px;
      margin: 14px 0 16px;
      align-items: end;
    }
    .category-groups { display: grid; gap: 14px; }
    .category-group {
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      background: #fbfcfe;
    }
    .category-group-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      background: #fff;
      border-bottom: 1px solid var(--line);
    }
    .category-group-head h3 { margin: 0; font-size: 16px; letter-spacing: 0; }
    .category-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 10px;
      padding: 12px;
    }
    .category-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fff;
      display: grid;
      gap: 8px;
      min-height: 96px;
    }
    .category-card strong { line-height: 1.25; }
    .category-card-meta { display: flex; gap: 8px; flex-wrap: wrap; color: var(--muted); font-size: 12px; font-weight: 700; }
    .category-admin {
      display: grid;
      gap: 12px;
      margin-top: 14px;
    }
    .category-admin-form {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) minmax(150px, 220px) minmax(120px, 160px) minmax(220px, 1fr) 120px;
      gap: 10px;
      align-items: end;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfcfe;
    }
    .category-admin-table-wrap {
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow-x: auto;
      background: #fff;
    }
    .category-admin-table { min-width: 1040px; }
    .category-admin-table th, .category-admin-table td { vertical-align: middle; }
    .category-admin-table input, .category-admin-table select { min-height: 32px; padding: 6px 8px; }
    .category-admin-table .keyword-field { min-width: 220px; }
    .category-admin-table .usage-cell { white-space: nowrap; color: var(--muted); font-weight: 700; }
    .category-admin-table tr.inactive { background: #f8fafc; color: var(--muted); }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 3px 8px;
      border-radius: 999px;
      background: #eef6f5;
      color: #0f5f58;
    }
    .filters, .metrics, .charts { display: grid; gap: 12px; }
    .filter-panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px 12px 12px;
      margin-bottom: 12px;
      box-shadow: none;
    }
    .filter-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
    .filter-panel h2 { margin: 0; font-size: 14px; letter-spacing: 0; }
    .filter-count { font-size: 12px; font-weight: 750; color: var(--muted); }
    .filter-top { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 12px; align-items: end; margin-bottom: 8px; }
    .filter-presets {
      display: inline-flex;
      gap: 0;
      align-self: end;
      width: fit-content;
      max-width: 100%;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #f8fafc;
    }
    .filter-presets button {
      min-height: 28px;
      border: 0;
      border-right: 1px solid var(--line);
      border-radius: 0;
      padding: 5px 9px;
      background: transparent;
      color: var(--muted);
      font-weight: 700;
    }
    .filter-presets button:last-child { border-right: 0; }
    .filter-presets button.active { background: #e8f5f3; color: #0f5f58; }
    .filter-dates { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .view-mode-panel {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) minmax(260px, 360px);
      gap: 12px;
      align-items: center;
      margin: 4px 0 12px;
      padding: 12px 14px;
      border: 1px solid rgba(13, 122, 111, .28);
      border-radius: 8px;
      background: #eef8f6;
      box-shadow: inset 3px 0 0 var(--accent);
    }
    .view-mode-copy { display: grid; gap: 3px; min-width: 0; }
    .view-mode-title { font-size: 13px; font-weight: 850; color: #0f5f58; }
    .view-mode-help { font-size: 12px; color: var(--muted); line-height: 1.35; }
    .view-mode-control {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      min-width: 0;
      color: #0f5f58;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
    }
    .view-mode-label { color: var(--muted); }
    .view-mode-label.active { color: #0f5f58; }
    .ios-switch {
      position: relative;
      display: inline-flex;
      align-items: center;
      width: 54px;
      height: 30px;
      flex: 0 0 auto;
    }
    .ios-switch input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
      width: 100%;
      height: 100%;
      min-height: 0;
      margin: 0;
    }
    .switch-track {
      width: 54px;
      height: 30px;
      border-radius: 999px;
      background: #cbd5e1;
      box-shadow: inset 0 0 0 1px rgba(15, 23, 42, .08);
      transition: background .18s ease;
    }
    .switch-thumb {
      display: block;
      width: 26px;
      height: 26px;
      margin: 2px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 4px rgba(15, 23, 42, .24);
      transition: transform .18s ease;
    }
    .ios-switch input:checked + .switch-track { background: var(--accent); }
    .ios-switch input:checked + .switch-track .switch-thumb { transform: translateX(24px); }
    .ios-switch input:focus-visible + .switch-track { outline: 2px solid rgba(13, 122, 111, .28); outline-offset: 3px; }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .card-context-panel {
      display: none;
      grid-template-columns: minmax(180px, 1.2fr) repeat(6, minmax(110px, 1fr)) minmax(220px, 1.4fr);
      gap: 0;
      margin: 0 0 12px;
      border: 1px solid rgba(13, 122, 111, .24);
      border-radius: 8px;
      overflow: hidden;
      background: #fbfffe;
    }
    .card-context-panel.visible { display: grid; }
    .card-context-item {
      padding: 10px 12px;
      border-right: 1px solid var(--line);
      min-width: 0;
    }
    .card-context-item:last-child { border-right: 0; }
    .card-context-label { color: var(--muted); font-size: 11px; font-weight: 750; text-transform: uppercase; letter-spacing: 0; }
    .card-context-value { margin-top: 3px; font-size: 14px; font-weight: 800; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .card-context-actions {
      padding: 10px 12px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }
    .card-context-actions button { min-height: 30px; padding: 5px 9px; white-space: nowrap; }
    .filters {
      grid-template-columns: minmax(240px, 1.65fr) repeat(5, minmax(110px, 1fr)) 76px;
      align-items: end;
      column-gap: 8px;
      row-gap: 8px;
    }
    .filters label, .filter-date { min-width: 0; }
    .filters .filter-reset { min-width: 0; }
    label { display: grid; gap: 5px; font-size: 12px; color: var(--muted); }
    input, select, button {
      font: inherit;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--ink);
      padding: 7px 10px;
      min-height: 34px;
    }
    input, select { width: 100%; min-width: 0; }
    button { cursor: pointer; font-weight: 650; }
    .primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    .refresh-button {
      background: var(--yellow);
      border-color: var(--yellow);
      color: #13232b;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0;
      min-width: 118px;
    }
    .filter-reset {
      width: 100%;
      white-space: nowrap;
      background: #f8fafc;
    }
    .metrics {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0;
      margin-bottom: 12px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 6px;
      overflow: hidden;
    }
    .metric, .chart, .entry-panel, .table-wrap, .monthly-panel, dialog {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 6px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    .metric {
      padding: 10px 12px;
      background: var(--panel);
      border: 0;
      border-right: 1px solid var(--line);
      border-radius: 0;
      box-shadow: none;
      min-width: 0;
    }
    .metric:last-child { border-right: 0; }
    .metric strong { display: block; font-size: 18px; margin: 4px 0 2px; font-weight: 750; text-align: left; white-space: nowrap; }
    .metric-meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--muted); font-size: 11px; font-weight: 700; }
    .progress { display: none; }
    .progress span { display: block; height: 100%; width: 0%; color: transparent; font-size: 0; line-height: 18px; text-align: right; padding-right: 0; transition: width .2s ease; }
    .metric.income .progress span { background: var(--teal); }
    .metric.expense .progress span { background: var(--red); }
    .metric.balance .progress span { background: var(--nav); }
    .metric.count .progress span { background: var(--yellow); color: #13232b; }
    .charts { grid-template-columns: repeat(12, minmax(0, 1fr)); }
    .monthly-panel { margin-bottom: 16px; overflow: hidden; }
    .monthly-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--line); }
    .monthly-head h2 { margin: 0; font-size: 15px; }
    .monthly-table-wrap { overflow-x: auto; }
    .monthly-table { min-width: 860px; }
    .monthly-table th, .monthly-table td { white-space: nowrap; }
    .monthly-table .name-cell { min-width: 240px; white-space: normal; }
    .monthly-table .money { text-align: right; font-variant-numeric: tabular-nums; }
    .monthly-table .group-row { background: #fbfcfe; font-weight: 750; cursor: pointer; }
    .monthly-table .total-row { background: #eef6f5; cursor: default; }
    .monthly-table .separate-row { background: #fffaf0; font-weight: 750; cursor: default; }
    .monthly-table .category-row { cursor: pointer; }
    .monthly-table .category-row td:first-child { padding-left: 28px; color: var(--muted); }
    .monthly-toggle { display: inline-block; width: 16px; color: var(--accent); font-weight: 800; }
    .chart { padding: 12px; height: 300px; display: flex; flex-direction: column; min-width: 0; }
    .chart:nth-child(1) { grid-column: span 7; }
    .chart:nth-child(2) { grid-column: span 5; }
    .chart:nth-child(3), .chart:nth-child(4), .chart:nth-child(5) { grid-column: span 4; height: 240px; }
    .chart h2, .table-title h2 { margin: 0 0 10px; font-size: 15px; letter-spacing: 0; }
    .chart canvas { width: 100% !important; height: 232px !important; max-height: 232px; display: block; }
    .entry-panel { margin-top: 16px; overflow: hidden; }
    #insertDialog { max-width: 1180px; width: min(1180px, calc(100vw - 32px)); max-height: calc(100vh - 32px); }
    #insertDialog .modal { padding: 0; gap: 0; max-height: min(88vh, 820px); }
    #insertDialog .entry-panel {
      display: grid;
      grid-template-rows: auto auto auto minmax(180px, 1fr) auto;
      max-height: inherit;
      min-height: 0;
      margin: 0;
      border: 0;
      box-shadow: none;
    }
    #insertDialog .entry-head { padding: 14px 16px; }
    .entry-head, .entry-tools {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px;
      border-bottom: 1px solid var(--line);
    }
    .entry-head h2 { margin: 0; font-size: 17px; letter-spacing: 0; }
    .entry-tools { align-items: end; background: #fbfcfe; flex-wrap: wrap; }
    .entry-tools label { min-width: 190px; flex: 1 1 190px; }
    .entry-paste { padding: 14px; display: grid; gap: 10px; border-bottom: 1px solid var(--line); }
    .entry-paste textarea { min-height: 86px; }
    .entry-table-wrap { overflow: auto; min-height: 0; }
    .entry-table { min-width: 1040px; }
    .entry-table th { position: sticky; top: 0; z-index: 1; }
    .entry-table th, .entry-table td { min-width: 130px; }
    .entry-table th:first-child, .entry-table td:first-child { min-width: 44px; width: 44px; text-align: center; }
    .entry-table input, .entry-table select { width: 100%; min-height: 36px; padding: 7px 9px; border-radius: 6px; }
    .entry-table .new-description { min-width: 220px; }
    .entry-status { padding: 10px 14px; color: var(--muted); font-size: 13px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .entry-status strong { color: var(--accent); }
    .entry-status .warn { color: var(--danger); }
	    .table-wrap { margin-top: 16px; overflow: hidden; }
	    .table-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px; border-bottom: 1px solid var(--line); }
	    .launch-toolbar {
	      display: grid;
	      grid-template-columns: minmax(220px, 1fr) auto;
	      gap: 16px;
	      align-items: center;
	      padding: 14px 16px;
	      border-bottom: 1px solid var(--line);
	      background: #fff;
	    }
	    .launch-toolbar h2 { margin: 0; font-size: 16px; letter-spacing: 0; }
	    .launch-toolbar-meta { margin-top: 3px; font-size: 12px; color: var(--muted); font-weight: 700; }
	    .launch-actions {
	      display: flex;
	      align-items: center;
	      justify-content: flex-end;
	      gap: 10px;
	      flex-wrap: wrap;
	    }
	    .launch-actions button { white-space: nowrap; }
	    .launch-filter-panel {
	      display: grid;
	      grid-template-columns: minmax(240px, 1.8fr) repeat(2, minmax(132px, .8fr)) repeat(5, minmax(122px, 1fr)) minmax(160px, 1fr) 86px;
	      gap: 10px;
	      align-items: end;
	      padding: 12px 16px;
	      border-bottom: 1px solid var(--line);
	      background: #fbfcfe;
	    }
	    .launch-filter-panel label { min-width: 0; }
	    .launch-filter-panel .launch-search-control { grid-column: span 2; }
	    .launch-date-basis {
	      display: grid;
	      gap: 5px;
	      min-width: 0;
	    }
	    .launch-date-basis-title {
	      color: var(--muted);
	      font-size: 12px;
	    }
	    .launch-date-basis-control {
	      min-height: 34px;
	      display: flex;
	      align-items: center;
	      justify-content: center;
	      gap: 8px;
	      padding: 5px 9px;
	      border: 1px solid var(--line);
	      border-radius: 6px;
	      background: #fff;
	      color: #0f5f58;
	      font-size: 12px;
	      font-weight: 800;
	      white-space: nowrap;
	    }
	    .launch-date-basis .ios-switch {
	      width: 44px;
	      height: 24px;
	    }
	    .launch-date-basis .switch-track {
	      width: 44px;
	      height: 24px;
	    }
	    .launch-date-basis .switch-thumb {
	      width: 20px;
	      height: 20px;
	    }
	    .launch-date-basis .ios-switch input:checked + .switch-track .switch-thumb { transform: translateX(20px); }
	    .launch-summary {
	      display: grid;
	      grid-template-columns: repeat(5, minmax(0, 1fr));
	      gap: 0;
	      border-bottom: 1px solid var(--line);
	      background: #fff;
	    }
	    .launch-summary-item {
	      padding: 10px 12px;
	      border-right: 1px solid var(--line);
	      min-width: 0;
	    }
	    .launch-summary-item:last-child { border-right: 0; }
	    .launch-summary-item span {
	      display: block;
	      color: var(--muted);
	      font-size: 11px;
	      font-weight: 750;
	      text-transform: uppercase;
	      letter-spacing: 0;
	    }
	    .launch-summary-item strong {
	      display: block;
	      margin-top: 4px;
	      font-size: 16px;
	      font-weight: 800;
	      white-space: nowrap;
	      overflow: hidden;
	      text-overflow: ellipsis;
	    }
	    .launch-summary-item.income strong { color: #0f766e; }
	    .launch-summary-item.expense strong { color: var(--danger); }
	    .launch-summary-item.recoverable strong { color: #a16207; }
	    .launch-summary-item.balance strong { color: var(--ink); }
	    .launch-summary-item.count strong { color: var(--accent); }
	    .transaction-controls {
	      display: grid;
      grid-template-columns: minmax(150px, 1fr) minmax(150px, 1fr) minmax(180px, 1.4fr) repeat(5, minmax(130px, 1fr)) 86px;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      background: #fbfcfe;
    }
    .statement-close-shell {
      border-bottom: 1px solid var(--line);
      background: #f7fbfa;
    }
    .statement-close-shell summary {
      min-height: 46px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 16px;
      cursor: pointer;
      list-style: none;
      color: #0f5f58;
      font-weight: 850;
    }
    .statement-close-shell summary::-webkit-details-marker { display: none; }
    .statement-close-shell summary::after {
      content: "Abrir";
      color: var(--muted);
      font-size: 12px;
      font-weight: 750;
    }
    .statement-close-shell[open] summary::after { content: "Recolher"; }
    .statement-close-summary {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .statement-close-summary span {
      color: var(--muted);
      font-size: 12px;
      font-weight: 650;
    }
    .statement-close-panel {
      display: grid;
      grid-template-columns: minmax(160px, 1.2fr) repeat(4, minmax(130px, 1fr)) auto;
      gap: 10px;
      align-items: end;
      padding: 0 16px 14px;
      background: transparent;
    }
    .statement-close-panel h3 {
      margin: 0 0 5px;
      font-size: 13px;
      color: #0f5f58;
      letter-spacing: 0;
    }
    .statement-close-intro { align-self: center; min-width: 0; }
    .statement-close-intro p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.35; }
    .statement-close-panel .statement-action { min-width: 142px; white-space: nowrap; }
    .statement-close-status {
      grid-column: 1 / -1;
      color: var(--muted);
      font-size: 12px;
      min-height: 16px;
    }
    .statement-close-status.warn { color: var(--danger); font-weight: 700; }
    .statement-paste {
      grid-column: 1 / -1;
    }
    .statement-paste textarea {
      min-height: 74px;
      border-radius: 6px;
      font-size: 12px;
    }
    .reconciliation-block {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      background: #fff;
      display: grid;
      gap: 8px;
    }
    .reconciliation-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .reconciliation-card {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px;
      min-width: 0;
      background: #fbfcfe;
    }
    .reconciliation-card strong { display: block; font-size: 12px; margin-bottom: 6px; }
    .reconciliation-card ul { margin: 0; padding-left: 16px; display: grid; gap: 4px; color: var(--muted); font-size: 12px; line-height: 1.3; }
    .reconciliation-card.warn strong { color: var(--danger); }
    .transaction-controls .search-control { min-width: 220px; }
    .transaction-controls .sort-control { min-width: 170px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 7px 9px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 650; background: #fbfcfe; }
    .sortable-th {
      width: 100%;
      min-height: 26px;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      display: inline-flex;
      align-items: center;
      justify-content: flex-start;
      gap: 6px;
      font: inherit;
      font-weight: inherit;
      text-align: left;
      white-space: nowrap;
    }
    .sortable-th::after {
      content: "";
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      opacity: .35;
    }
    .sortable-th.asc::after { border-bottom: 6px solid currentColor; opacity: 1; }
    .sortable-th.desc::after { border-top: 6px solid currentColor; opacity: 1; }
    .sortable-th.active { color: var(--accent); }
    td.money { text-align: right; white-space: nowrap; font-weight: 650; }
    tr.changed, .tx-card.changed { background: var(--edited); box-shadow: inset 4px 0 0 var(--edited-line); }
    .table-title-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
    .batch-count { font-weight: 650; color: var(--accent); min-width: 92px; text-align: right; }
    .batch-button[disabled] { opacity: 0.5; cursor: not-allowed; }
    .edit-field { width: 100%; min-width: 120px; min-height: 36px; padding: 7px 9px; border-radius: 6px; }
    .edit-field.description { min-width: 220px; }
    .edit-field.value { min-width: 104px; text-align: right; }
    td.id-cell { color: var(--muted); white-space: nowrap; font-weight: 650; }
    .statement-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      max-width: 100%;
      min-height: 20px;
      margin-top: 5px;
      padding: 2px 7px;
      border: 1px solid #cce4df;
      border-radius: 999px;
      background: #f3fbf9;
      color: #0f5f58;
      font-size: 11px;
      font-weight: 750;
      line-height: 1.2;
      white-space: nowrap;
    }
    .statement-badge::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--accent);
      flex: 0 0 auto;
    }
    .tx-date-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .tx-date-row .statement-badge { margin-top: 0; }
    .tx-cards { display: none; }
    .tx-card {
      padding: 13px 14px;
      border-bottom: 1px solid var(--line);
      display: grid;
      gap: 8px;
    }
    .tx-card-top, .tx-card-bottom, .tx-edit-grid {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .tx-edit-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .tx-date { color: var(--muted); font-size: 13px; white-space: nowrap; }
    .tx-desc { font-weight: 700; line-height: 1.25; }
    .tx-money { font-weight: 800; white-space: nowrap; color: var(--ink); }
    .tx-meta { color: var(--muted); font-size: 13px; line-height: 1.35; }
    dialog { border: 1px solid var(--line); max-width: 920px; width: min(920px, calc(100vw - 32px)); padding: 0; }
    dialog::backdrop { background: rgba(15, 23, 42, 0.42); }
    .modal { padding: 0; display: grid; gap: 0; max-height: min(86vh, 760px); overflow: hidden; }
    .modal-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 16px 18px 12px; border-bottom: 1px solid var(--line); }
    .modal-head h2 { margin: 0; font-size: 18px; }
    .modal-head button { min-height: 32px; padding: 5px 10px; background: #f8fafc; }
    #dialogIntro { padding: 10px 18px; margin: 0; border-bottom: 1px solid var(--line); background: #fbfcfe; }
    .modal > div:not(.modal-head):not(.actions) { min-height: 0; }
    .modal > div > .muted:first-child { display: none; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    textarea { width: 100%; min-height: 92px; resize: vertical; font: inherit; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
    .confirmation-table-wrap {
      border: 0;
      border-radius: 0;
      max-height: min(58vh, 520px);
      overflow: auto;
      background: #fff;
    }
    .confirmation-table { font-size: 12px; min-width: 760px; table-layout: fixed; }
    .confirmation-table th { position: sticky; top: 0; z-index: 1; }
    .confirmation-table th, .confirmation-table td { padding: 8px 10px; vertical-align: middle; }
    .confirmation-table th:nth-child(1) { width: 64px; }
    .confirmation-table th:nth-child(2) { width: 84px; }
    .confirmation-table th:nth-child(4) { width: 92px; }
    .confirmation-table th:nth-child(5) { width: 160px; }
    .confirmation-table th:nth-child(6) { width: 150px; }
    .confirmation-table th:nth-child(7) { width: 90px; }
    .confirmation-table .date-cell, .confirmation-table .id-cell { white-space: nowrap; }
    .confirmation-table .money { text-align: right; font-weight: 700; white-space: nowrap; }
    .statement-confirm-summary {
      display: grid;
      grid-template-columns: minmax(180px, 1.2fr) repeat(5, minmax(112px, 1fr));
      border-bottom: 1px solid var(--line);
      background: #fbfffe;
    }
    .statement-confirm-item { padding: 10px 12px; border-right: 1px solid var(--line); min-width: 0; }
    .statement-confirm-item:last-child { border-right: 0; }
    .statement-confirm-label { color: var(--muted); font-size: 11px; font-weight: 750; text-transform: uppercase; letter-spacing: 0; }
    .statement-confirm-value { margin-top: 3px; font-size: 14px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .statement-confirm-value.warn { color: var(--danger); }
    .confirmation-raw { display: none; }
    .actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; padding: 12px 18px; border-top: 1px solid var(--line); background: #fff; }
    .warn { color: var(--danger); font-weight: 650; }
    @media (max-width: 860px) {
      .app-shell { grid-template-columns: 1fr; }
      .sidebar { position: static; }
      .topbar { display: none; }
      .brand { min-height: 52px; }
      .nav-search { display: none; }
      .nav-steps { display: flex; overflow-x: auto; padding: 8px 10px; }
      .nav-steps button { text-align: center; flex: 0 0 auto; }
      .brand { font-size: 16px; }
      .dashboard-head { grid-template-columns: 1fr; padding: 16px 14px 12px; gap: 10px; }
      h1 { font-size: 24px; }
      main { padding: 12px 10px 28px; }
      input, select, button { min-height: 40px; padding: 9px 10px; }
      .filter-panel { padding: 12px; }
      .filter-top { grid-template-columns: 1fr; align-items: stretch; }
      .filter-dates { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .view-mode-panel { grid-template-columns: 1fr; padding: 12px; }
      .view-mode-control { justify-content: flex-start; flex-wrap: wrap; white-space: normal; }
      .card-context-panel { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .card-context-item { border-right: 0; border-bottom: 1px solid var(--line); }
      .card-context-actions { grid-column: 1 / -1; justify-content: stretch; }
      .card-context-actions button { flex: 1 1 160px; }
      .filter-head { align-items: flex-start; flex-direction: column; }
      .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .filter-date, .filter-group, .filter-category, .filter-account, .filter-user, .filter-type,
      .filters .search-field, .filters .filter-reset { grid-column: span 1; min-width: 0; width: 100%; }
      .filters .search-field, .filters .filter-reset { grid-column: 1 / -1; }
      .metrics { grid-template-columns: 1fr; }
      .metric { border-right: 0; border-bottom: 1px solid var(--line); }
      .metric:last-child { border-bottom: 0; }
      .metric strong { font-size: 17px; text-align: left; }
      .charts { grid-template-columns: 1fr; }
      .chart:nth-child(1), .chart:nth-child(2), .chart:nth-child(3), .chart:nth-child(4), .chart:nth-child(5) { grid-column: auto; }
      .chart { height: 286px; padding: 12px; }
      .chart canvas { height: 220px !important; max-height: 220px; }
      .form-grid { grid-template-columns: 1fr; }
      .entry-head, .entry-tools { align-items: flex-start; padding: 12px; flex-direction: column; }
      .entry-tools label, .entry-tools button { width: 100%; }
      .entry-paste { padding: 12px; }
	      .table-title { align-items: flex-start; padding: 12px; flex-direction: column; }
	      .table-title-actions { width: 100%; justify-content: space-between; }
	      .table-title h2 { font-size: 17px; }
	      .launch-toolbar { grid-template-columns: 1fr; padding: 12px; }
	      .launch-actions { justify-content: stretch; }
	      .launch-actions button, .launch-actions .batch-count { flex: 1 1 140px; }
	      .launch-filter-panel { grid-template-columns: 1fr; padding: 12px; }
	      .launch-filter-panel .launch-search-control { grid-column: auto; }
	      .launch-summary { grid-template-columns: 1fr; }
	      .launch-summary-item { border-right: 0; border-bottom: 1px solid var(--line); }
	      .launch-summary-item:last-child { border-bottom: 0; }
	      .statement-close-shell summary { align-items: flex-start; flex-direction: column; padding: 12px; }
	      .statement-close-shell summary::after { content: ""; display: none; }
	      .statement-close-summary { align-items: flex-start; flex-direction: column; }
	      .statement-close-panel { grid-template-columns: 1fr; padding: 0 12px 12px; }
	      .statement-close-panel .statement-action { width: 100%; }
	      .transaction-controls { grid-template-columns: 1fr; padding: 12px; }
      .accounts-toolbar { justify-content: stretch; }
      .accounts-toolbar button { width: 100%; }
      .account-admin-form { grid-template-columns: 1fr; }
      .category-tools { grid-template-columns: 1fr; }
      .category-admin-form { grid-template-columns: 1fr; }
      .category-list { grid-template-columns: 1fr; }
      dialog { width: calc(100vw - 16px); }
      .modal-head { padding: 12px; }
      #dialogIntro { padding: 10px 12px; }
      .statement-confirm-summary { grid-template-columns: 1fr; }
      .statement-confirm-item { border-right: 0; border-bottom: 1px solid var(--line); }
      .statement-confirm-item:last-child { border-bottom: 0; }
      .reconciliation-grid { grid-template-columns: 1fr; }
      .confirmation-table { min-width: 680px; }
      .actions { padding: 10px 12px; }
      .actions button { flex: 1 1 140px; }
      .table-wrap > table { display: none; }
      .tx-cards { display: block; }
      .tx-edit-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">G</span> Gestão Financeira</div>
      <nav class="nav-steps" aria-label="Seções">
        <button type="button" class="active" data-section="dashboard">Dashboard</button>
        <button type="button" data-section="launches">Lançamentos</button>
        <button type="button" data-section="categories">Categorias</button>
        <button type="button" data-section="accounts">Contas</button>
        <button type="button" disabled>Orçamento</button>
        <button type="button" disabled>Relatórios</button>
      </nav>
    </aside>
    <div class="content">
  <header>
    <div class="topbar">
      <div class="topbar-user">Matheus</div>
    </div>
    <div class="dashboard-head">
      <div>
        <h1 class="page-title" id="pageTitle"></h1>
        <div class="muted page-meta">__TITLE__ · gerado em <span id="generatedAt"></span></div>
      </div>
      <button class="refresh-button" id="topRefresh">Atualizar</button>
    </div>
  </header>
  <main>
    <section class="screen section-panel" id="accountsScreen" hidden>
      <div class="config-head">
        <div>
          <h2>Contas</h2>
          <div class="muted">Edite a linha e use Salvar na própria linha para gravar na base.</div>
        </div>
      </div>
      <div class="account-admin">
        <div class="accounts-toolbar">
          <button id="reloadAccounts" type="button">Recarregar da base</button>
        </div>
        <div class="account-admin-form">
          <label>Nova conta <input id="newAccountName" placeholder="Nome da conta"></label>
          <label>Tipo <select id="newAccountType">
            <option value="conta_corrente">Conta corrente</option>
            <option value="cartao_credito">Cartão de crédito</option>
            <option value="caixa">Caixa</option>
            <option value="poupanca">Poupança</option>
          </select></label>
          <label>Titular <select id="newAccountOwner"></select></label>
          <label>Status <select id="newAccountActive">
            <option value="true">Ativa</option>
            <option value="false">Inativa</option>
          </select></label>
          <button class="primary" id="createAccount" type="button">Criar</button>
        </div>
        <div class="config-message" id="accountAdminMessage"></div>
        <div class="account-admin-table-wrap">
          <table class="account-admin-table">
            <thead>
              <tr>
                <th>Nome</th><th>Tipo</th><th>Titular</th><th>Status</th><th>Uso</th><th>Bandeira</th><th>Final</th><th>Fecha</th><th>Vence</th><th>Tolerância</th><th>Apelidos</th><th>Ação</th>
              </tr>
            </thead>
            <tbody id="accountRows"></tbody>
          </table>
        </div>
      </div>
    </section>
    <section class="screen section-panel" id="categoriesScreen" hidden>
      <div class="config-head">
        <div>
          <h2>Categorias</h2>
          <div class="muted">Catálogo de classificação usado nos lançamentos e na inclusão em lote.</div>
        </div>
      </div>
      <div class="category-tools">
        <label>Buscar categoria <input id="categorySearch" type="search" placeholder="Ex.: mercado, saúde, cartão..."></label>
        <label>Grupo <select id="categoryGroupView"><option value="">Todos os grupos</option></select></label>
      </div>
      <div class="category-admin">
        <div class="category-admin-form">
          <label>Nova categoria <input id="newCategoryName" placeholder="Nome da categoria"></label>
          <label>Grupo <select id="newCategoryGroup"></select></label>
          <label>Tipo padrão <select id="newCategoryType">
            <option value="variavel">Variável</option>
            <option value="fixo">Fixo</option>
            <option value="projeto">Projeto</option>
          </select></label>
          <label>Palavras-chave <input id="newCategoryKeywords" placeholder="mercado, feira, compras"></label>
          <button class="primary" id="createCategory" type="button">Criar</button>
        </div>
        <div class="config-message" id="categoryAdminMessage"></div>
        <div class="category-admin-table-wrap">
          <table class="category-admin-table">
            <thead>
              <tr>
                <th>Nome</th><th>Grupo</th><th>Tipo</th><th>Palavras-chave</th><th>Status</th><th>Uso</th><th></th>
              </tr>
            </thead>
            <tbody id="categoryRows"></tbody>
          </table>
        </div>
      </div>
    </section>
    <div class="screen" id="dashboardScreen">
    <section class="filter-panel" aria-label="Filtros">
      <div class="filter-head">
        <h2>Filtros</h2>
        <span class="filter-count" id="activeFilterCount">Período padrão</span>
      </div>
      <div class="filter-top">
        <div class="filter-presets" aria-label="Períodos rápidos">
          <button type="button" data-period-preset="current">Mês atual</button>
          <button type="button" data-period-preset="previous">Mês anterior</button>
          <button type="button" data-period-preset="next4">Próximos 4 meses</button>
          <button type="button" data-period-preset="year">Ano</button>
        </div>
        <div class="filter-dates">
          <label class="filter-date">Data inicial <input id="start" type="date"></label>
          <label class="filter-date">Data final <input id="end" type="date"></label>
        </div>
      </div>
      <div class="view-mode-panel">
        <div class="view-mode-copy">
          <div class="view-mode-title">Forma de visualização</div>
          <div class="view-mode-help">Define qual data alimenta filtros, cartões, tabela mensal e gráficos.</div>
        </div>
        <div class="view-mode-control" aria-label="Forma de visualização">
          <span class="view-mode-label" id="transactionModeLabel">Data da transação</span>
          <label class="ios-switch" aria-label="Alternar para vencimento e competência">
            <input id="dateBasisSwitch" type="checkbox" checked>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
          <span class="view-mode-label active" id="effectiveModeLabel">Vencimento / competência</span>
        </div>
        <select id="dateBasis" class="visually-hidden" aria-label="Forma de visualização">
          <option value="effective" selected>Vencimento / competência</option>
          <option value="transaction">Data da transação</option>
        </select>
      </div>
      <div class="filters">
        <label class="search-field">Busca <input id="search" type="search" placeholder="Descrição, categoria, conta..."></label>
        <label class="filter-group">Grupo <select id="groupFilter"><option value="">Todos</option></select></label>
        <label class="filter-category">Categoria <select id="categoryFilter"><option value="">Todas</option></select></label>
        <label class="filter-account">Conta <select id="accountFilter"><option value="">Todas</option></select></label>
        <label class="filter-user">Usuário <select id="userFilter"><option value="">Todos</option></select></label>
        <label class="filter-type">Tipo <select id="typeFilter">
          <option value="">Todos</option>
          <option value="variavel">Variável</option>
          <option value="fixo">Fixo</option>
          <option value="projeto">Projeto</option>
        </select></label>
        <button class="filter-reset" id="clearFilters" type="button">Limpar</button>
      </div>
    </section>
    <section class="card-context-panel" id="cardContextPanel" aria-label="Resumo do cartão selecionado">
      <div class="card-context-item">
        <div class="card-context-label">Cartão</div>
        <div class="card-context-value" id="cardContextName">-</div>
      </div>
      <div class="card-context-item">
        <div class="card-context-label">Bandeira / final</div>
        <div class="card-context-value" id="cardContextBrand">-</div>
      </div>
      <div class="card-context-item">
        <div class="card-context-label">Fechamento</div>
        <div class="card-context-value" id="cardContextClosing">-</div>
      </div>
      <div class="card-context-item">
        <div class="card-context-label">Vencimento</div>
        <div class="card-context-value" id="cardContextDue">-</div>
      </div>
      <div class="card-context-item">
        <div class="card-context-label">Tolerância</div>
        <div class="card-context-value" id="cardContextTolerance">-</div>
      </div>
      <div class="card-context-item">
        <div class="card-context-label">Status</div>
        <div class="card-context-value" id="cardContextStatus">-</div>
      </div>
      <div class="card-context-item">
        <div class="card-context-label">Total fatura</div>
        <div class="card-context-value" id="cardContextStatementTotal">-</div>
      </div>
      <div class="card-context-actions">
        <button type="button" id="showCardDueView">Ver por vencimento</button>
        <button type="button" id="showCardPurchaseView">Ver compras da fatura</button>
      </div>
    </section>
    <section class="metrics">
      <div class="metric income">
        <span class="muted">Receitas</span><strong id="incomeTotal">R$ 0,00</strong>
        <div class="metric-meta"><span>% do total</span><span id="incomePct">0%</span></div>
        <div class="progress"><span id="incomeBar"></span></div>
      </div>
      <div class="metric expense">
        <span class="muted">Despesas</span><strong id="expenseTotal">R$ 0,00</strong>
        <div class="metric-meta"><span>% do total</span><span id="expensePct">0%</span></div>
        <div class="progress"><span id="expenseBar"></span></div>
      </div>
      <div class="metric balance">
        <span class="muted">Resultado</span><strong id="balanceTotal">R$ 0,00</strong>
        <div class="metric-meta"><span>receitas - despesas</span><span id="balancePct">0%</span></div>
        <div class="progress"><span id="balanceBar"></span></div>
      </div>
      <div class="metric count">
        <span class="muted">Lançamentos</span><strong id="countTotal">0</strong>
        <div class="metric-meta"><span>Dados salvos</span><span id="pendingPct">0</span></div>
        <div class="progress"><span id="pendingBar"></span></div>
      </div>
    </section>
    <section class="monthly-panel">
      <div class="monthly-head">
        <h2>Despesas por grupo e categoria</h2>
        <span class="muted">Receitas e A recuperar ficam separados do total</span>
      </div>
      <div class="monthly-table-wrap">
        <table class="monthly-table">
          <thead id="monthlyHead"></thead>
          <tbody id="monthlyRows"></tbody>
        </table>
      </div>
    </section>
    <section class="charts">
      <div class="chart"><h2>Evolução por dia</h2><canvas id="dailyChart"></canvas></div>
      <div class="chart"><h2>Grupos</h2><canvas id="groupChart"></canvas></div>
      <div class="chart"><h2>Categorias</h2><canvas id="categoryChart"></canvas></div>
      <div class="chart"><h2>Contas e cartões</h2><canvas id="accountChart"></canvas></div>
      <div class="chart"><h2>Usuários</h2><canvas id="userChart"></canvas></div>
    </section>
    </div>
    <section class="screen" id="launchesScreen" hidden>
    <section class="table-wrap">
	      <div class="launch-toolbar">
	        <div>
	          <h2>Transações</h2>
	          <div class="launch-toolbar-meta" id="rangeLabel"></div>
	        </div>
	        <div class="launch-actions">
	          <button id="openInsertDialog" type="button">Nova transação</button>
	          <span class="batch-count" id="batchCount">0 alteradas</span>
	          <button class="primary batch-button" id="generateBatch" disabled>Preparar edição</button>
	        </div>
	      </div>
	      <div class="launch-filter-panel">
	        <label class="launch-search-control">Busca <input id="launchSearch" type="search" placeholder="Descrição, categoria, conta..."></label>
	        <label>Data inicial <input id="launchStart" type="date"></label>
	        <label>Data final <input id="launchEnd" type="date"></label>
	        <label>Grupo <select id="launchGroupFilter"><option value="">Todos</option></select></label>
	        <label>Categoria <select id="launchCategoryFilter"><option value="">Todas</option></select></label>
	        <label>Conta <select id="launchAccountFilter"><option value="">Todas</option></select></label>
	        <label>Usuário <select id="launchUserFilter"><option value="">Todos</option></select></label>
	        <label>Tipo <select id="launchTypeFilter">
	          <option value="">Todos</option>
	          <option value="variavel">Variável</option>
	          <option value="fixo">Fixo</option>
	          <option value="projeto">Projeto</option>
	        </select></label>
	        <label class="sort-control">Ordenar <select id="sortOrder">
	          <option value="date-desc">Data mais recente</option>
	          <option value="date-asc">Data mais antiga</option>
	          <option value="value-desc">Maior valor</option>
	          <option value="value-asc">Menor valor</option>
	          <option value="description-asc">Descrição A-Z</option>
	          <option value="description-desc">Descrição Z-A</option>
	          <option value="category-asc">Categoria A-Z</option>
	          <option value="category-desc">Categoria Z-A</option>
	          <option value="account-asc">Conta A-Z</option>
	          <option value="account-desc">Conta Z-A</option>
	          <option value="user-asc">Usuário A-Z</option>
	          <option value="user-desc">Usuário Z-A</option>
	          <option value="id-desc">ID maior</option>
	          <option value="id-asc">ID menor</option>
	        </select></label>
	        <div class="launch-date-basis">
	          <div class="launch-date-basis-title">Visualização</div>
	          <div class="launch-date-basis-control" aria-label="Forma de visualização dos lançamentos">
	            <span class="view-mode-label" id="launchTransactionModeLabel">Transação</span>
	            <label class="ios-switch" aria-label="Alternar lançamentos para vencimento e competência">
	              <input id="launchDateBasisSwitch" type="checkbox" checked>
	              <span class="switch-track"><span class="switch-thumb"></span></span>
	            </label>
	            <span class="view-mode-label active" id="launchEffectiveModeLabel">Vencimento</span>
	          </div>
	        </div>
	        <select id="launchDateBasis" class="visually-hidden" aria-label="Forma de visualização dos lançamentos">
	          <option value="effective" selected>Vencimento / competência</option>
	          <option value="transaction">Data da transação</option>
	        </select>
	        <button class="filter-reset" id="clearLaunchFilters" type="button">Limpar</button>
	      </div>
	      <section class="launch-summary" aria-label="Resumo dos lançamentos filtrados">
	        <div class="launch-summary-item income">
	          <span>Receitas</span>
	          <strong id="launchIncomeTotal">R$ 0,00</strong>
	        </div>
	        <div class="launch-summary-item expense">
	          <span>Despesas</span>
	          <strong id="launchExpenseTotal">R$ 0,00</strong>
	        </div>
	        <div class="launch-summary-item recoverable">
	          <span>A recuperar</span>
	          <strong id="launchRecoverableTotal">R$ 0,00</strong>
	        </div>
	        <div class="launch-summary-item balance">
	          <span>Resultado</span>
	          <strong id="launchBalanceTotal">R$ 0,00</strong>
	        </div>
	        <div class="launch-summary-item count">
	          <span>Lançamentos</span>
	          <strong id="launchCountTotal">0</strong>
	        </div>
	      </section>
	      <details class="statement-close-shell">
	        <summary>
	          <div class="statement-close-summary">
	            <strong>Fechar fatura</strong>
	            <span>Concilie compras do cartão quando tiver o valor final da fatura.</span>
	          </div>
	        </summary>
	        <section class="statement-close-panel" aria-label="Fechamento de fatura">
	          <div class="statement-close-intro">
	            <h3>Dados da fatura</h3>
	            <p>Revise o período e cole itens só se quiser comparar contra a fatura.</p>
	          </div>
	          <label>Cartão <select id="statementAccount"></select></label>
	          <label>Vencimento <input id="statementDue" type="date"></label>
	          <label>Início <input id="statementStart" type="date"></label>
	          <label>Fim <input id="statementEnd" type="date"></label>
	          <label>Valor da fatura <input id="statementAmount" type="text" placeholder="0,00"></label>
	          <button class="primary statement-action" id="prepareStatementClose" type="button">Revisar fatura</button>
	          <label class="statement-paste">Itens da fatura
	            <textarea id="statementItems" placeholder="Cole do Excel: dia&#9;valor&#10;13&#9;22,94&#10;15&#9;9,94"></textarea>
	          </label>
	          <div class="statement-close-status" id="statementCloseStatus"></div>
	        </section>
	      </details>
      <table>
        <thead>
          <tr>
            <th><button class="sortable-th" type="button" data-sort-field="id">ID</button></th>
            <th><button class="sortable-th" type="button" data-sort-field="date">Data</button></th>
            <th><button class="sortable-th" type="button" data-sort-field="description">Descrição</button></th>
            <th><button class="sortable-th" type="button" data-sort-field="category">Categoria</button></th>
            <th><button class="sortable-th" type="button" data-sort-field="account">Conta</button></th>
            <th><button class="sortable-th" type="button" data-sort-field="user">Usuário</button></th>
            <th><button class="sortable-th" type="button" data-sort-field="value">Valor</button></th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
      <div class="tx-cards" id="txCards"></div>
    </section>
    </section>
  </main>

  <dialog id="insertDialog">
    <div class="modal">
      <section class="entry-panel">
        <div class="entry-head">
          <h2>Novas transações</h2>
          <div class="table-title-actions">
            <span class="muted" id="newRowCount">0 linhas</span>
            <button id="addNewRow">Adicionar linha</button>
            <button class="primary batch-button" id="generateInsert" disabled>Preparar inclusão</button>
            <button id="closeInsertDialog" type="button">Fechar</button>
          </div>
        </div>
        <div class="entry-tools">
          <label>Usuário dos lançamentos <select id="newUser"></select></label>
          <label>Conta padrão <select id="newDefaultAccount"></select></label>
          <label>Categoria padrão <select id="newDefaultCategory"></select></label>
        </div>
        <div class="entry-paste">
          <label>Colar linhas do Excel
            <textarea id="newPaste" placeholder="Data&#9;Descrição&#9;Valor&#9;Parcelas"></textarea>
          </label>
          <div class="actions">
            <span id="newStatus" class="muted"></span>
            <button id="loadNewPaste">Carregar linhas</button>
          </div>
        </div>
        <div class="entry-table-wrap">
          <table class="entry-table">
            <thead>
              <tr>
                <th></th><th>Data</th><th>Descrição</th><th>Valor total</th><th>Parcelas</th><th>Categoria</th><th>Conta</th>
              </tr>
            </thead>
            <tbody id="newRows"></tbody>
          </table>
        </div>
        <div class="entry-status">
          <span id="newReadyCount">0 prontas</span>
          <span>As linhas só entram nos indicadores depois da confirmação e gravação.</span>
        </div>
      </section>
    </div>
  </dialog>

  <dialog id="editDialog">
    <div class="modal">
      <div class="modal-head">
        <h2 id="dialogTitle">Confirmar operação</h2>
        <button id="closeDialog" aria-label="Fechar">Fechar</button>
      </div>
      <p class="muted" id="dialogIntro">A operação será validada pelo backend antes de qualquer gravação.</p>
      <div>
        <div class="muted">Resumo da validação</div>
        <div class="confirmation-table-wrap" id="confirmationTableWrap"></div>
      </div>
      <label class="confirmation-raw">Resumo bruto <textarea id="editCommand" readonly></textarea></label>
      <div class="actions">
        <span id="copyStatus" class="muted"></span>
        <button class="primary" id="confirmCommand" disabled>Confirmar e gravar</button>
      </div>
    </div>
  </dialog>
    </div>
  </div>

  <script>
    let DASHBOARD = __DASHBOARD_DATA__;
    const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const palette = ['#2563eb', '#0d7a6f', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#65a30d', '#be123c', '#475569', '#ea580c'];
    let charts = {};
    const edits = new Map();
    const newRows = [];
    const expandedGroups = new Set();
    let drilldownActive = false;
    let pendingConfirmation = null;
    let pendingOperationKind = '';

    const byId = (id) => document.getElementById(id);
    const norm = (value) => String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim();
    const dashboardToken = () => window.location.pathname.split('/').filter(Boolean).pop() || '';
    const money = (value) => {
      const raw = String(value || '0').trim().replace(/[R$\\s]/g, '');
      if (!raw) return 0;
      if (raw.includes(',') && raw.includes('.')) return Number(raw.replace(/\\./g, '').replace(',', '.'));
      if (raw.includes(',')) return Number(raw.replace(',', '.'));
      return Number(raw);
    };
    const isIncome = (tx) => tx.grupo === 'Receitas';
    const isRecoverable = (tx) => tx.grupo === 'A recuperar';
    const isExpense = (tx) => !isIncome(tx);
    const isOperatingExpense = (tx) => isExpense(tx) && !isRecoverable(tx);
    const accountByName = (name) => DASHBOARD.accounts.find((item) => item.nome === name) || null;
    const cardConfigs = () => Array.isArray(DASHBOARD.cardConfigs?.items) ? DASHBOARD.cardConfigs.items : (Array.isArray(DASHBOARD.cardConfigs) ? DASHBOARD.cardConfigs : []);
    const cardConfigForTx = (tx) => cardConfigs().find((item) => String(item.conta_id) === String(tx.conta_id)) || null;
    const cardConfigForAccount = (account) => cardConfigs().find((item) => String(item.conta_id) === String(account?.id)) || null;

    function dateWithClampedDay(year, month, day) {
      const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const safeDay = Math.max(1, Math.min(Number(day || 1), last));
      return new Date(Date.UTC(year, month - 1, safeDay)).toISOString().slice(0, 10);
    }

    function addMonthKey(key, offset) {
      const [year, month] = String(key).split('-').map(Number);
      return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
    }

    const sortFieldMap = {
      date: 'date',
      value: 'value',
      description: 'description',
      category: 'category',
      account: 'account',
      user: 'user',
      id: 'id',
    };
    const sortDefaultDirection = {
      date: 'desc',
      value: 'desc',
      description: 'asc',
      category: 'asc',
      account: 'asc',
      user: 'asc',
      id: 'desc',
    };

    function predictedCardDueDate(tx) {
      const config = cardConfigForTx(tx);
      const account = accountById(tx.conta_id) || accountByName(tx.conta);
      if (!config?.dia_fechamento || !config?.dia_vencimento || account?.tipo !== 'cartao_credito') return '';
      const [year, month, day] = String(tx.data || '').split('-').map(Number);
      if (!year || !month || !day) return '';
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      const dueKey = day <= Number(config.dia_fechamento) ? monthKey : addMonthKey(monthKey, 1);
      const [dueYear, dueMonth] = dueKey.split('-').map(Number);
      return dateWithClampedDay(dueYear, dueMonth, Number(config.dia_vencimento));
    }

	    function dateForView(tx) {
	      return dateForBasis(tx, byId('dateBasis')?.value || 'effective');
	    }

	    function dateForBasis(tx, basis) {
	      if (basis !== 'effective') return tx.data || '';
	      return tx.fatura_vencimento || tx.competencia_mes || predictedCardDueDate(tx) || tx.data || '';
	    }

    function splitSortOrder(sortOrder = '') {
      const [field = 'date', direction = 'desc'] = String(sortOrder || 'date-desc').split('-');
      return { field, direction: direction === 'asc' ? 'asc' : 'desc' };
    }

    function compareText(a, b) {
      return String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base', numeric: true });
    }

    function dateSortNumber(value) {
      const raw = String(value || '').trim();
      const iso = raw.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})$/);
      if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      const br = raw.match(/^(\\d{1,2})[\\/.-](\\d{1,2})(?:[\\/.-](\\d{2,4}))?$/);
      if (br) {
        const year = br[3] ? Number(br[3].padStart(4, '20')) : 0;
        return Date.UTC(year, Number(br[2]) - 1, Number(br[1]));
      }
      const parsed = Date.parse(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function sortValue(tx, field, dateBasis, options = {}) {
      if (field === 'date') return dateSortNumber(options.displayedDate ? tx.data : dateForBasis(tx, dateBasis));
      if (field === 'value') return money(tx.valor);
      if (field === 'description') return tx.descricao || '';
      if (field === 'category') return tx.categoria || '';
      if (field === 'account') return tx.conta || '';
      if (field === 'user') return tx.usuario || '';
      if (field === 'id') return Number(tx.id || 0);
      return dateForBasis(tx, dateBasis);
    }

    function compareTransactions(a, b, sortOrder, dateBasis, options = {}) {
      const { field, direction } = splitSortOrder(sortOrder);
      const left = sortValue(a, field, dateBasis, options);
      const right = sortValue(b, field, dateBasis, options);
      let result;
      if (field === 'date' || field === 'value' || field === 'id') result = Number(left || 0) - Number(right || 0);
      else result = compareText(left, right);
      if (result === 0) result = Number(a.id || 0) - Number(b.id || 0);
      return direction === 'asc' ? result : -result;
    }

    function updateSortHeaderState() {
      const { field, direction } = splitSortOrder(byId('sortOrder')?.value || 'date-desc');
      document.querySelectorAll('.sortable-th').forEach((button) => {
        const active = sortFieldMap[button.dataset.sortField] === field;
        button.classList.toggle('active', active);
        button.classList.toggle('asc', active && direction === 'asc');
        button.classList.toggle('desc', active && direction === 'desc');
        button.setAttribute('aria-sort', active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');
      });
    }

    function setSortFromHeader(fieldName) {
      const field = sortFieldMap[fieldName] || 'date';
      const current = splitSortOrder(byId('sortOrder')?.value || 'date-desc');
      const direction = current.field === field
        ? (current.direction === 'asc' ? 'desc' : 'asc')
        : sortDefaultDirection[field];
      byId('sortOrder').value = `${field}-${direction}`;
      render();
    }

    function sumBy(rows, key) {
      const totals = new Map();
      for (const tx of rows) {
        if (!isOperatingExpense(tx)) continue;
        totals.set(tx[key], (totals.get(tx[key]) || 0) + money(tx.valor));
      }
      return [...totals.entries()].sort((a, b) => b[1] - a[1]);
    }

	    function filteredRows() {
	      const start = byId('start').value || DASHBOARD.defaultStart;
	      const end = byId('end').value || DASHBOARD.defaultEnd;
      const query = byId('search').value.trim().toLowerCase();
      const group = byId('groupFilter')?.value || '';
      const categoryId = byId('categoryFilter')?.value || '';
      const account = byId('accountFilter')?.value || '';
      const user = byId('userFilter')?.value || '';
      const type = byId('typeFilter')?.value || '';
      const dateBasis = byId('dateBasis')?.value || 'effective';
      const sortOrder = byId('sortOrder')?.value || 'date-desc';
      const rows = DASHBOARD.transactions.filter((tx) => {
        const viewDate = dateForBasis(tx, dateBasis);
        const inRange = viewDate >= start && viewDate <= end;
        const haystack = `${tx.descricao} ${tx.grupo} ${tx.categoria} ${tx.conta} ${tx.usuario} ${tx.tipo}`.toLowerCase();
        return inRange
          && (!query || haystack.includes(query))
          && (!group || tx.grupo === group)
          && (!categoryId || String(tx.categoria_id) === categoryId)
          && (!account || tx.conta === account)
          && (!user || String(tx.usuario_lancamento_id) === user)
          && (!type || tx.tipo === type);
      });
      rows.sort((a, b) => compareTransactions(a, b, sortOrder, dateBasis));
	      return rows;
	    }

	    function launchFilteredRows() {
	      const start = byId('launchStart').value || DASHBOARD.defaultStart;
	      const end = byId('launchEnd').value || DASHBOARD.defaultEnd;
	      const dateBasis = byId('launchDateBasis')?.value || 'transaction';
	      const query = byId('launchSearch').value.trim().toLowerCase();
	      const group = byId('launchGroupFilter')?.value || '';
	      const categoryId = byId('launchCategoryFilter')?.value || '';
	      const account = byId('launchAccountFilter')?.value || '';
	      const user = byId('launchUserFilter')?.value || '';
	      const type = byId('launchTypeFilter')?.value || '';
	      const sortOrder = byId('sortOrder')?.value || 'date-desc';
	      const rows = DASHBOARD.transactions.filter((tx) => {
	        const viewDate = dateForBasis(tx, dateBasis);
	        const inRange = viewDate >= start && viewDate <= end;
	        const haystack = `${tx.descricao} ${tx.grupo} ${tx.categoria} ${tx.conta} ${tx.usuario} ${tx.tipo}`.toLowerCase();
	        return inRange
	          && (!query || haystack.includes(query))
	          && (!group || tx.grupo === group)
	          && (!categoryId || String(tx.categoria_id) === categoryId)
	          && (!account || tx.conta === account)
	          && (!user || String(tx.usuario_lancamento_id) === user)
	          && (!type || tx.tipo === type);
	      });
	      rows.sort((a, b) => compareTransactions(a, b, sortOrder, dateBasis, { displayedDate: true }));
	      return rows;
	    }

    function setOptions(selectId, values) {
      const select = byId(selectId);
      const selected = select.value;
      select.innerHTML = select.options[0].outerHTML + values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
      if (values.includes(selected)) select.value = selected;
    }

    function setCategoryFilterOptions(items) {
      const select = byId('categoryFilter');
      const selected = select.value;
      select.innerHTML = select.options[0].outerHTML + items.map((item) => (
        `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nome || item.label)}</option>`
      )).join('');
      if (items.some((item) => String(item.id) === selected)) select.value = selected;
    }

    function setUserFilterOptions(items) {
      const select = byId('userFilter');
      const selected = select.value;
      select.innerHTML = select.options[0].outerHTML + items.map((item) => (
        `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nome)}</option>`
      )).join('');
      if (items.some((item) => String(item.id) === selected)) select.value = selected;
    }

    function copySelectOptions(sourceId, targetId) {
      const source = byId(sourceId);
      const target = byId(targetId);
      if (!source || !target) return;
      const selected = target.value;
      target.innerHTML = source.innerHTML;
      target.value = [...target.options].some((option) => option.value === selected) ? selected : source.value;
    }

	    function syncLaunchFiltersFromMain() {
	      byId('launchStart').value = byId('start').value || DASHBOARD.defaultStart;
	      byId('launchEnd').value = byId('end').value || DASHBOARD.defaultEnd;
	      byId('launchDateBasis').value = byId('dateBasis').value || 'effective';
	      syncLaunchDateBasisSwitch();
	      byId('launchSearch').value = byId('search').value || '';
	      copySelectOptions('groupFilter', 'launchGroupFilter');
      copySelectOptions('categoryFilter', 'launchCategoryFilter');
      copySelectOptions('accountFilter', 'launchAccountFilter');
      copySelectOptions('userFilter', 'launchUserFilter');
      byId('launchTypeFilter').value = byId('typeFilter').value || '';
    }

	    function applyLaunchFiltersToMain() {
	      const values = {
	        start: byId('launchStart').value || DASHBOARD.defaultStart,
	        end: byId('launchEnd').value || DASHBOARD.defaultEnd,
	        dateBasis: byId('launchDateBasis').value || 'effective',
	        search: byId('launchSearch').value || '',
	        group: byId('launchGroupFilter').value || '',
	        category: byId('launchCategoryFilter').value || '',
	        account: byId('launchAccountFilter').value || '',
	        user: byId('launchUserFilter').value || '',
	        type: byId('launchTypeFilter').value || '',
	      };
	      byId('start').value = values.start;
	      byId('end').value = values.end;
	      byId('dateBasis').value = values.dateBasis;
	      syncDateBasisSwitch();
	      byId('search').value = values.search;
	      byId('groupFilter').value = values.group;
	      byId('accountFilter').value = values.account;
	      byId('userFilter').value = values.user;
	      byId('typeFilter').value = values.type;
      refreshFilterOptions();
      byId('categoryFilter').value = [...byId('categoryFilter').options].some((option) => option.value === values.category) ? values.category : '';
      syncLaunchFiltersFromMain();
      render();
    }

    function optionList(items, valueKey, labelKey, selected) {
      return items.map((item) => {
        const value = String(item[valueKey] ?? '');
        const label = String(item[labelKey] ?? '');
        return `<option value="${escapeHtml(value)}"${value === String(selected ?? '') ? ' selected' : ''}>${escapeHtml(label)}</option>`;
      }).join('');
    }

    function optionListWithBlank(items, valueKey, labelKey, selected, blankLabel = 'Selecione') {
      return `<option value="">${escapeHtml(blankLabel)}</option>` + optionList(items, valueKey, labelKey, selected);
    }

    function categoryOptions(selected = '', blankLabel = 'Categoria') {
      const groups = [...new Set(DASHBOARD.categories.map((item) => item.grupo || 'Sem grupo'))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const blocks = groups.map((group) => {
        const options = DASHBOARD.categories
          .filter((item) => (item.grupo || 'Sem grupo') === group)
          .sort((a, b) => String(a.nome || a.label).localeCompare(String(b.nome || b.label), 'pt-BR'))
          .map((item) => {
            const value = String(item.id ?? '');
            const label = String(item.nome || item.label || '');
            return `<option value="${escapeHtml(value)}"${value === String(selected ?? '') ? ' selected' : ''}>${escapeHtml(label)}</option>`;
          })
          .join('');
        return `<optgroup label="${escapeHtml(group)}">${options}</optgroup>`;
      }).join('');
      return `<option value="">${escapeHtml(blankLabel)}</option>${blocks}`;
    }

    function categoryById(id) {
      return DASHBOARD.categories.find((item) => String(item.id) === String(id)) || null;
    }

    function accountById(id) {
      return DASHBOARD.accounts.find((item) => String(item.id) === String(id)) || null;
    }

    function userById(id) {
      return DASHBOARD.users.find((item) => String(item.id) === String(id)) || null;
    }

    function originalTx(id) {
      return DASHBOARD.transactions.find((tx) => String(tx.id) === String(id)) || null;
    }

    function editedFields(id) {
      return edits.get(String(id)) || {};
    }

    function txValue(tx, field) {
      if (field === 'categoria_id') return String(tx.categoria_id ?? '');
      if (field === 'conta_id') return String(tx.conta_id ?? '');
      if (field === 'usuario_lancamento_id') return String(tx.usuario_lancamento_id ?? '');
      return String(tx[field] ?? '');
    }

    function brMoneyInput(value) {
      const parsed = money(value);
      if (!Number.isFinite(parsed)) return '';
      return parsed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function workingValue(tx, field) {
      const changed = editedFields(tx.id);
      const value = Object.prototype.hasOwnProperty.call(changed, field) ? String(changed[field] ?? '') : txValue(tx, field);
      return field === 'valor' ? brMoneyInput(value) : value;
    }

    function hasChanges(id) {
      return Object.keys(editedFields(id)).length > 0;
    }

    function fieldChanged(tx, field, value) {
      if (field === 'valor') return Math.abs(money(value) - money(tx.valor)) >= 0.005;
      return String(value ?? '') !== txValue(tx, field);
    }

    function normalizeFieldValue(field, value) {
      if (field !== 'valor') return value;
      return brMoneyInput(value);
    }

    function isoDateFromCell(value) {
      const raw = String(value || '').trim();
      if (/^\\d{4}-\\d{2}-\\d{2}$/.test(raw)) return raw;
      const match = raw.match(/^(\\d{1,2})[\\/.-](\\d{1,2})(?:[\\/.-](\\d{2,4}))?$/);
      if (!match) return '';
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      const currentYear = new Date().getFullYear();
      const year = match[3] ? match[3].padStart(4, '20') : String(currentYear);
      return `${year}-${month}-${day}`;
    }

    function newRowTemplate(seed = {}) {
      const categoryId = seed.categoria_id || byId('newDefaultCategory')?.value || '';
      const category = categoryById(categoryId);
      return {
        data: seed.data || byId('start').value || DASHBOARD.defaultStart,
        descricao: seed.descricao || '',
        valor: seed.valor ? brMoneyInput(seed.valor) : '',
        parcelas: seed.parcelas || 1,
        categoria_id: categoryId,
        conta_id: seed.conta_id || byId('newDefaultAccount')?.value || '',
        tipo: seed.tipo || category?.tipo || 'variavel',
      };
    }

    function addNewRow(seed = {}) {
      newRows.push(newRowTemplate(seed));
      renderNewRows();
      render();
    }

    function removeNewRow(index) {
      newRows.splice(index, 1);
      renderNewRows();
      render();
    }

    function completeNewRow(row) {
      return Boolean(
        byId('newUser').value
        && row.data
        && row.descricao.trim()
        && money(row.valor) > 0
        && Number(row.parcelas) >= 1
        && Number(row.parcelas) <= 48
        && row.categoria_id
        && row.conta_id
      );
    }

    function pendingRows() {
      const user = userById(byId('newUser')?.value || '');
      return newRows.filter(completeNewRow).map((row, index) => {
        const category = categoryById(row.categoria_id) || {};
        const account = accountById(row.conta_id) || {};
        const type = category.tipo || row.tipo || 'variavel';
        return {
          id: `novo-${index + 1}`,
          data: row.data,
          descricao: row.descricao,
          valor: money(row.valor),
          tipo: type,
          grupo: category.grupo || 'Sem grupo',
          categoria: category.nome || category.label || 'Sem categoria',
          categoria_id: row.categoria_id,
          conta: account.nome || 'Sem conta',
          conta_id: row.conta_id,
          usuario: user?.nome || 'Sem usuário',
          usuario_lancamento_id: byId('newUser').value,
        };
      });
    }

    function analysisRows() {
      return filteredRows();
    }

    function parsePastedRows() {
      const text = byId('newPaste').value.trim();
      if (!text) return [];
      return text.split(/\\n+/).map((line) => {
        const cells = line.split(/\\t|;/).map((cell) => cell.trim());
        const [data, descricao, valor, parcelas] = cells;
        return newRowTemplate({
          data: isoDateFromCell(data),
          descricao: descricao || '',
          valor: valor || '',
          parcelas: parcelas || 1,
        });
      }).filter((row) => row.data || row.descricao || row.valor);
    }

    function updateNewEntryState() {
      const ready = newRows.filter(completeNewRow).length;
      const missing = [];
      if (!byId('newUser').value) missing.push('usuário');
      if (newRows.some((row) => !row.categoria_id)) missing.push('categoria');
      if (newRows.some((row) => !row.conta_id)) missing.push('conta');
      if (newRows.some((row) => !row.data || !row.descricao.trim() || money(row.valor) <= 0)) missing.push('dados da linha');
      byId('newRowCount').textContent = `${newRows.length} linha${newRows.length === 1 ? '' : 's'}`;
      byId('newReadyCount').innerHTML = `<strong>${ready}</strong> pronta${ready === 1 ? '' : 's'} de ${newRows.length}`;
      byId('generateInsert').disabled = ready === 0;
      byId('newStatus').innerHTML = missing.length && newRows.length
        ? `<span class="warn">Falta completar: ${escapeHtml([...new Set(missing)].join(', '))}.</span>`
        : '';
    }

    function renderNewRows() {
      byId('newRows').innerHTML = newRows.map((row, index) => `
        <tr>
          <td><button type="button" class="remove-new-row" data-index="${index}" aria-label="Remover">&times;</button></td>
          <td><input class="new-field" data-index="${index}" data-field="data" type="date" value="${escapeHtml(row.data)}"></td>
          <td><input class="new-field new-description" data-index="${index}" data-field="descricao" type="text" value="${escapeHtml(row.descricao)}"></td>
          <td><input class="new-field" data-index="${index}" data-field="valor" type="text" value="${escapeHtml(row.valor)}"></td>
          <td><input class="new-field" data-index="${index}" data-field="parcelas" type="number" min="1" max="48" value="${escapeHtml(row.parcelas)}"></td>
          <td><select class="new-field" data-index="${index}" data-field="categoria_id">${categoryOptions(row.categoria_id, 'Categoria')}</select></td>
          <td><select class="new-field" data-index="${index}" data-field="conta_id">${optionListWithBlank(DASHBOARD.accounts, 'id', 'nome', row.conta_id, 'Conta')}</select></td>
        </tr>
      `).join('');
      updateNewEntryState();
    }

    function queueNewField(input, formatMoney = false) {
      const index = Number(input.dataset.index);
      const field = input.dataset.field || '';
      if (!newRows[index] || !field) return;
      let value = input.value;
      if (field === 'valor' && formatMoney) {
        value = brMoneyInput(value);
        input.value = value;
      }
      if (field === 'categoria_id' && value) {
        newRows[index].tipo = categoryById(value)?.tipo || 'variavel';
      }
      newRows[index][field] = value;
      updateNewEntryState();
    }

    function insertPayload() {
      const entries = newRows.filter(completeNewRow).map((row) => ({
        ...(categoryById(row.categoria_id)?.tipo ? { tipo: categoryById(row.categoria_id).tipo } : {}),
        data: row.data,
        descricao: row.descricao.trim(),
        valor: brMoneyInput(row.valor),
        parcelas: Number(row.parcelas || 1),
        categoria_id: Number(row.categoria_id),
        conta_id: Number(row.conta_id),
      }));
      return {
        action: 'incluir_lancamentos_familiares',
        usuario_lancamento_id: Number(byId('newUser').value),
        entries,
      };
    }

    function buildInsertMessage() {
      const payload = insertPayload();
      return [
        `Incluir ${payload.entries.length} lançamento(s) familiar(es) abaixo. Quero uma única confirmação antes de gravar.`,
        '',
        'PEDIDO_INCLUSAO_LOTE_FAMILIAR',
        '```json',
        JSON.stringify(payload, null, 2),
        '```'
      ].join('\\n');
    }

    function refreshFilterOptions() {
      const start = byId('start').value || DASHBOARD.defaultStart;
      const end = byId('end').value || DASHBOARD.defaultEnd;
      const selectedGroup = byId('groupFilter')?.value || '';
      const base = DASHBOARD.transactions.filter((tx) => {
        const viewDate = dateForView(tx);
        return viewDate >= start && viewDate <= end;
      });
      const groups = [...new Set(DASHBOARD.categories.map((item) => item.grupo || 'Sem grupo').concat(base.map((tx) => tx.grupo)))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const categoryBase = DASHBOARD.categories
        .filter((item) => !selectedGroup || item.grupo === selectedGroup)
        .map((item) => ({ id: String(item.id), nome: item.nome || item.label, label: item.label }));
      const accounts = [...new Set(DASHBOARD.accounts.map((item) => item.nome).concat(base.map((tx) => tx.conta)))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const users = DASHBOARD.users.map((item) => ({ id: String(item.id), nome: item.nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      setOptions('groupFilter', groups);
      setCategoryFilterOptions(categoryBase);
      setOptions('accountFilter', accounts);
      setUserFilterOptions(users);
      if (!byId('launchesScreen')?.hidden) syncLaunchFiltersFromMain();
    }

	    function syncDateBasisSwitch() {
	      const isEffective = byId('dateBasis')?.value === 'effective';
      const switchEl = byId('dateBasisSwitch');
      if (switchEl) switchEl.checked = isEffective;
      byId('effectiveModeLabel')?.classList.toggle('active', isEffective);
	      byId('transactionModeLabel')?.classList.toggle('active', !isEffective);
	    }

	    function syncLaunchDateBasisSwitch() {
	      const isEffective = byId('launchDateBasis')?.value === 'effective';
	      const switchEl = byId('launchDateBasisSwitch');
	      if (switchEl) switchEl.checked = isEffective;
	      byId('launchEffectiveModeLabel')?.classList.toggle('active', isEffective);
	      byId('launchTransactionModeLabel')?.classList.toggle('active', !isEffective);
	    }

	    function setDateBasisFromSwitch() {
	      byId('dateBasis').value = byId('dateBasisSwitch').checked ? 'effective' : 'transaction';
	      syncDateBasisSwitch();
	      refreshFilterOptions();
	      render();
	    }

	    function setDateBasisFromLaunchSwitch() {
	      byId('launchDateBasis').value = byId('launchDateBasisSwitch').checked ? 'effective' : 'transaction';
	      syncLaunchDateBasisSwitch();
	      applyLaunchFiltersToMain();
	    }

    function resetDashboardFilters() {
      byId('start').value = DASHBOARD.defaultStart;
      byId('end').value = DASHBOARD.defaultEnd;
      byId('dateBasis').value = 'effective';
      syncDateBasisSwitch();
      byId('search').value = '';
      byId('groupFilter').value = '';
      byId('accountFilter').value = '';
      byId('userFilter').value = '';
      byId('typeFilter').value = '';
      refreshFilterOptions();
      byId('categoryFilter').value = '';
      expandedGroups.clear();
      drilldownActive = false;
    }

    function renderChart(id, config) {
      if (charts[id]) charts[id].destroy();
      charts[id] = new Chart(byId(id), config);
    }

    function dateRange(start, end) {
      const out = [];
      const current = new Date(`${start}T00:00:00`);
      const last = new Date(`${end}T00:00:00`);
      while (current <= last) {
        out.push(current.toISOString().slice(0, 10));
        current.setDate(current.getDate() + 1);
      }
      return out;
    }

    function shortDate(value) {
      const [year, month, day] = String(value).split('-');
      if (!year || !month || !day) return String(value || '-');
      return `${day}/${month}`;
    }

    function shortMonth(value) {
      const [year, month] = String(value || '').split('-');
      return month && year ? `${month}/${year}` : '';
    }

    function formatStatementPeriod(value) {
      const [start, end] = String(value || '').split(' a ');
      if (!start || !end) return value || '-';
      return `${shortDate(start)} a ${shortDate(end)}`;
    }

    function monthKey(value) {
      return String(value || '').slice(0, 7);
    }

    function monthStart(key) {
      return `${key}-01`;
    }

    function monthEnd(key) {
      const [year, month] = key.split('-').map(Number);
      return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    }

    function addMonthsToDate(value, offset) {
      const [year, month, day] = String(value).split('-').map(Number);
      const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
      return dateWithClampedDay(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, day || 1);
    }

    function statementCycleForAccount(account) {
      const config = cardConfigForAccount(account);
      if (!account || account.tipo !== 'cartao_credito' || !config?.dia_fechamento || !config?.dia_vencimento) return null;
      const [year, month] = monthKey(DASHBOARD.defaultStart).split('-').map(Number);
      const dueDate = dateWithClampedDay(year, month, Number(config.dia_vencimento));
      let periodEnd = dateWithClampedDay(year, month, Number(config.dia_fechamento));
      if (periodEnd >= dueDate) periodEnd = addMonthsToDate(periodEnd, -1);
      const previousClose = addMonthsToDate(periodEnd, -1);
      const startDate = new Date(`${previousClose}T00:00:00Z`);
      startDate.setUTCDate(startDate.getUTCDate() + 1);
      return {
        start: startDate.toISOString().slice(0, 10),
        end: periodEnd,
        due: dueDate,
      };
    }

    function creditCardAccounts() {
      return DASHBOARD.accounts.filter((account) => account.tipo === 'cartao_credito');
    }

    function accountBySelectValue(value) {
      return DASHBOARD.accounts.find((account) => String(account.id) === String(value)) || null;
    }

    function defaultStatementDue(account) {
      const config = cardConfigForAccount(account);
      const [year, month] = monthKey(DASHBOARD.defaultStart).split('-').map(Number);
      if (config?.dia_vencimento) return dateWithClampedDay(year, month, Number(config.dia_vencimento));
      return byId('launchEnd')?.value || DASHBOARD.defaultEnd;
    }

    function statementCycleForDue(account, dueDate) {
      const config = cardConfigForAccount(account);
      if (!account || account.tipo !== 'cartao_credito' || !config?.dia_fechamento || !dueDate) return null;
      const [year, month] = String(dueDate).split('-').map(Number);
      let periodEnd = dateWithClampedDay(year, month, Number(config.dia_fechamento));
      if (periodEnd >= dueDate) periodEnd = addMonthsToDate(periodEnd, -1);
      const previousClose = addMonthsToDate(periodEnd, -1);
      const startDate = new Date(`${previousClose}T00:00:00Z`);
      startDate.setUTCDate(startDate.getUTCDate() + 1);
      return { start: startDate.toISOString().slice(0, 10), end: periodEnd, due: dueDate };
    }

    function syncStatementCycleFields(force = false) {
      const account = accountBySelectValue(byId('statementAccount')?.value || '');
      const due = byId('statementDue')?.value || defaultStatementDue(account);
      if (due && !byId('statementDue').value) byId('statementDue').value = due;
      const cycle = statementCycleForDue(account, due);
      if (!cycle) return;
      if (force || !byId('statementStart').value) byId('statementStart').value = cycle.start;
      if (force || !byId('statementEnd').value) byId('statementEnd').value = cycle.end;
    }

    function initStatementCloseControls() {
      const cards = creditCardAccounts();
      const current = byId('statementAccount')?.value || '';
      byId('statementAccount').innerHTML = optionListWithBlank(cards, 'id', 'nome', current || cards[0]?.id || '', 'Cartão');
      if (!cards.some((card) => String(card.id) === String(byId('statementAccount').value)) && cards[0]) {
        byId('statementAccount').value = cards[0].id;
      }
      if (!byId('statementDue').value) byId('statementDue').value = defaultStatementDue(accountBySelectValue(byId('statementAccount').value));
      syncStatementCycleFields(!byId('statementStart').value || !byId('statementEnd').value);
    }

    function statementClosePayload() {
      return {
        conta_id: Number(byId('statementAccount').value || 0),
        fatura_vencimento: byId('statementDue').value,
        fatura_periodo_inicio: byId('statementStart').value,
        fatura_periodo_fim: byId('statementEnd').value,
        valor_fatura: byId('statementAmount').value,
        itens_fatura: byId('statementItems').value,
      };
    }

    function addMonthsToKey(key, offset) {
      const [year, month] = String(key).split('-').map(Number);
      return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
    }

    function periodPresetRange(preset) {
      const current = monthKey(DASHBOARD.defaultStart);
      if (preset === 'previous') {
        const previous = addMonthsToKey(current, -1);
        return [monthStart(previous), monthEnd(previous)];
      }
      if (preset === 'next4') {
        const next = addMonthsToKey(current, 1);
        const last = addMonthsToKey(current, 4);
        return [monthStart(next), monthEnd(last)];
      }
      if (preset === 'year') {
        return [`${current.slice(0, 4)}-01-01`, `${current.slice(0, 4)}-12-31`];
      }
      return [monthStart(current), monthEnd(current)];
    }

    function selectedPeriodPreset() {
      const start = byId('start').value;
      const end = byId('end').value;
      for (const button of document.querySelectorAll('[data-period-preset]')) {
        const [presetStart, presetEnd] = periodPresetRange(button.dataset.periodPreset);
        if (start === presetStart && end === presetEnd) return button.dataset.periodPreset;
      }
      return '';
    }

    function renderFilterState() {
      const active = [];
      if (byId('dateBasis')?.value === 'transaction') active.push('data da transação');
      if (byId('search')?.value.trim()) active.push('busca');
      if (byId('groupFilter')?.value) active.push('grupo');
      if (byId('categoryFilter')?.value) active.push('categoria');
      if (byId('accountFilter')?.value) active.push('conta');
      if (byId('userFilter')?.value) active.push('usuário');
      if (byId('typeFilter')?.value) active.push('tipo');
      const preset = selectedPeriodPreset();
      byId('activeFilterCount').textContent = active.length ? `${active.length} filtro${active.length === 1 ? '' : 's'} ativo${active.length === 1 ? '' : 's'}` : (preset ? 'Período rápido' : 'Período personalizado');
      document.querySelectorAll('[data-period-preset]').forEach((button) => {
        button.classList.toggle('active', button.dataset.periodPreset === preset);
      });
    }

    function renderCardContext() {
      const panel = byId('cardContextPanel');
      const account = accountByName(byId('accountFilter')?.value || '');
      const config = cardConfigForAccount(account);
      const visible = Boolean(account && account.tipo === 'cartao_credito');
      panel.classList.toggle('visible', visible);
      if (!visible) return;
      const brand = [config?.bandeira, config?.final_cartao ? `final ${config.final_cartao}` : ''].filter(Boolean).join(' · ') || 'Não informado';
      const cycle = statementCycleForAccount(account);
      byId('cardContextName').textContent = account.nome || 'Cartão';
      byId('cardContextBrand').textContent = brand;
      byId('cardContextClosing').textContent = config?.dia_fechamento ? `Dia ${config.dia_fechamento}` : 'Não informado';
      byId('cardContextDue').textContent = config?.dia_vencimento ? `Dia ${config.dia_vencimento}` : 'Não informado';
      byId('cardContextTolerance').textContent = config?.tolerancia_diferenca ? fmt.format(money(config.tolerancia_diferenca)) : 'Não informado';
      byId('cardContextStatus').textContent = cycle ? `Compras ${shortDate(cycle.start)} a ${shortDate(cycle.end)} vencem ${shortDate(cycle.due)}` : (config?.configured ? (config?.ativo === false ? 'Inativo' : 'Configurado') : 'Pendente em Contas');
      const statementTotal = filteredRows().filter((tx) => !isIncome(tx)).reduce((sum, tx) => sum + money(tx.valor), 0);
      byId('cardContextStatementTotal').textContent = fmt.format(statementTotal);
    }

    function applyCardStatementView(mode) {
      const account = accountByName(byId('accountFilter')?.value || '');
      const cycle = statementCycleForAccount(account);
      if (!cycle) return;
      if (mode === 'purchase') {
        byId('dateBasis').value = 'transaction';
        byId('start').value = cycle.start;
        byId('end').value = cycle.end;
      } else {
        byId('dateBasis').value = 'effective';
        byId('start').value = cycle.due;
        byId('end').value = cycle.due;
      }
      syncDateBasisSwitch();
      refreshFilterOptions();
      render();
    }

    function dashboardMonths() {
      return Array.isArray(DASHBOARD.dashboardMonths) && DASHBOARD.dashboardMonths.length
        ? DASHBOARD.dashboardMonths
        : [{ key: monthKey(DASHBOARD.defaultStart), label: monthKey(DASHBOARD.defaultStart) }];
    }

    function monthlyFilterRows() {
      const months = dashboardMonths();
      const first = monthStart(months[0].key);
      const last = monthEnd(months[months.length - 1].key);
      const query = byId('search').value.trim().toLowerCase();
      const group = byId('groupFilter')?.value || '';
      const categoryId = byId('categoryFilter')?.value || '';
      const account = byId('accountFilter')?.value || '';
      const user = byId('userFilter')?.value || '';
      const type = byId('typeFilter')?.value || '';
      return DASHBOARD.transactions.filter((tx) => {
        const haystack = `${tx.descricao} ${tx.grupo} ${tx.categoria} ${tx.conta} ${tx.usuario} ${tx.tipo}`.toLowerCase();
        const viewDate = dateForView(tx);
        return viewDate >= first && viewDate <= last
          && isOperatingExpense(tx)
          && (!query || haystack.includes(query))
          && (!group || tx.grupo === group)
          && (!categoryId || String(tx.categoria_id) === categoryId)
          && (!account || tx.conta === account)
          && (!user || String(tx.usuario_lancamento_id) === user)
          && (!type || tx.tipo === type);
      });
    }

    function addMonthlyValue(target, key, value) {
      target.months[key] = (target.months[key] || 0) + value;
      target.total += value;
    }

    function monthlySummary() {
      const months = dashboardMonths();
      const groups = new Map();
      for (const tx of monthlyFilterRows()) {
        const groupName = tx.grupo || 'Sem grupo';
        const catKey = String(tx.categoria_id || `${groupName}:${tx.categoria}`);
        const key = monthKey(dateForView(tx));
        if (!months.some((item) => item.key === key)) continue;
        const value = money(tx.valor);
        if (!groups.has(groupName)) groups.set(groupName, { name: groupName, months: {}, total: 0, categories: new Map() });
        const group = groups.get(groupName);
        addMonthlyValue(group, key, value);
        if (!group.categories.has(catKey)) {
          group.categories.set(catKey, {
            id: tx.categoria_id,
            name: tx.categoria || 'Sem categoria',
            group: groupName,
            months: {},
            total: 0,
          });
        }
        addMonthlyValue(group.categories.get(catKey), key, value);
      }
      return [...groups.values()].sort((a, b) => b.total - a.total);
    }

    function monthlySeparateSummary(groupName) {
      const months = dashboardMonths();
      const summary = { name: groupName, months: {}, total: 0 };
      const query = byId('search').value.trim().toLowerCase();
      const group = byId('groupFilter')?.value || '';
      const categoryId = byId('categoryFilter')?.value || '';
      const account = byId('accountFilter')?.value || '';
      const user = byId('userFilter')?.value || '';
      const type = byId('typeFilter')?.value || '';
      for (const tx of DASHBOARD.transactions) {
        if ((tx.grupo || '') !== groupName) continue;
        const haystack = `${tx.descricao} ${tx.grupo} ${tx.categoria} ${tx.conta} ${tx.usuario} ${tx.tipo}`.toLowerCase();
        if (query && !haystack.includes(query)) continue;
        if (group && tx.grupo !== group) continue;
        if (categoryId && String(tx.categoria_id) !== categoryId) continue;
        if (account && tx.conta !== account) continue;
        if (user && String(tx.usuario_lancamento_id) !== user) continue;
        if (type && tx.tipo !== type) continue;
        const key = monthKey(dateForView(tx));
        if (!months.some((item) => item.key === key)) continue;
        const viewDate = dateForView(tx);
        const first = monthStart(months[0].key);
        const last = monthEnd(months[months.length - 1].key);
        if (viewDate < first || viewDate > last) continue;
        addMonthlyValue(summary, key, money(tx.valor));
      }
      return summary;
    }

	    function renderMonthlySummary() {
      const months = dashboardMonths();
      byId('monthlyHead').innerHTML = `<tr><th class="name-cell">Grupo / categoria</th>${months.map((item) => `<th class="money">${escapeHtml(item.label)}</th>`).join('')}<th class="money">Total</th></tr>`;
      const rows = [];
      const groups = monthlySummary();
      const grandTotals = months.reduce((acc, item) => ({ ...acc, [item.key]: 0 }), {});
      let grandTotal = 0;
      for (const group of groups) {
        months.forEach((item) => { grandTotals[item.key] += group.months[item.key] || 0; });
        grandTotal += group.total;
        const open = expandedGroups.has(group.name);
        rows.push(`
          <tr class="group-row" data-monthly-group="${escapeHtml(group.name)}">
            <td class="name-cell"><span class="monthly-toggle">${open ? '−' : '+'}</span>${escapeHtml(group.name)}</td>
            ${months.map((item) => `<td class="money">${fmt.format(group.months[item.key] || 0)}</td>`).join('')}
            <td class="money">${fmt.format(group.total)}</td>
          </tr>
        `);
        if (open) {
          [...group.categories.values()].sort((a, b) => b.total - a.total).forEach((category) => {
            rows.push(`
              <tr class="category-row" data-monthly-category="${escapeHtml(category.id)}" data-monthly-group-name="${escapeHtml(category.group)}">
                <td class="name-cell">${escapeHtml(category.name)}</td>
                ${months.map((item) => `<td class="money">${fmt.format(category.months[item.key] || 0)}</td>`).join('')}
                <td class="money">${fmt.format(category.total)}</td>
              </tr>
            `);
          });
        }
      }
      if (groups.length) {
        rows.push(`
          <tr class="group-row total-row">
            <td class="name-cell">Total despesas</td>
            ${months.map((item) => `<td class="money">${fmt.format(grandTotals[item.key] || 0)}</td>`).join('')}
            <td class="money">${fmt.format(grandTotal)}</td>
          </tr>
        `);
      }
      ['A recuperar', 'Receitas'].forEach((name) => {
        const item = monthlySeparateSummary(name);
        if (!item.total) return;
        rows.push(`
          <tr class="separate-row">
            <td class="name-cell">${escapeHtml(name)}</td>
            ${months.map((month) => `<td class="money">${fmt.format(item.months[month.key] || 0)}</td>`).join('')}
            <td class="money">${fmt.format(item.total)}</td>
          </tr>
        `);
      });
	      byId('monthlyRows').innerHTML = rows.length ? rows.join('') : `<tr><td colspan="${months.length + 2}" class="muted">Nenhum gasto encontrado no período.</td></tr>`;
	    }

	    function renderLaunchSummary(rows) {
	      const expenses = rows.filter(isOperatingExpense).reduce((sum, tx) => sum + money(tx.valor), 0);
	      const recoverable = rows.filter(isRecoverable).reduce((sum, tx) => sum + money(tx.valor), 0);
	      const income = rows.filter(isIncome).reduce((sum, tx) => sum + money(tx.valor), 0);
	      byId('launchIncomeTotal').textContent = fmt.format(income);
	      byId('launchExpenseTotal').textContent = fmt.format(expenses);
	      byId('launchRecoverableTotal').textContent = fmt.format(recoverable);
	      byId('launchBalanceTotal').textContent = fmt.format(income - expenses);
	      byId('launchCountTotal').textContent = String(rows.length);
	    }

    const commonChartOptions = {
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12 } },
        tooltip: { callbacks: { label: (ctx) => {
          const parsed = ctx.parsed || 0;
          const value = typeof parsed === 'number' ? parsed : (parsed.y ?? parsed.x ?? 0);
          return `${ctx.dataset.label || ctx.label}: ${fmt.format(value)}`;
        } } }
      }
    };

	    function render() {
	      const launchVisible = !byId('launchesScreen')?.hidden;
	      const rows = launchVisible ? launchFilteredRows() : filteredRows();
	      const chartRows = analysisRows();
	      const filterStart = launchVisible ? (byId('launchStart').value || DASHBOARD.defaultStart) : (byId('start').value || DASHBOARD.defaultStart);
	      const filterEnd = launchVisible ? (byId('launchEnd').value || DASHBOARD.defaultEnd) : (byId('end').value || DASHBOARD.defaultEnd);
      const expenses = chartRows.filter(isOperatingExpense).reduce((sum, tx) => sum + money(tx.valor), 0);
      const recoverable = chartRows.filter(isRecoverable).reduce((sum, tx) => sum + money(tx.valor), 0);
      const income = chartRows.filter(isIncome).reduce((sum, tx) => sum + money(tx.valor), 0);
      const totalFlow = Math.max(income + expenses + recoverable, 1);
      const incomePct = Math.round((income / totalFlow) * 100);
      const expensePct = Math.round((expenses / totalFlow) * 100);
      const balancePct = income > 0 ? Math.max(0, Math.round(((income - expenses) / income) * 100)) : 0;
      byId('expenseTotal').textContent = fmt.format(expenses);
      byId('incomeTotal').textContent = fmt.format(income);
      byId('balanceTotal').textContent = fmt.format(income - expenses);
      byId('countTotal').textContent = chartRows.length;
      byId('incomePct').textContent = `${incomePct}%`;
      byId('expensePct').textContent = `${expensePct}%`;
      byId('balancePct').textContent = `${balancePct}%`;
      byId('pendingPct').textContent = `${chartRows.length} salvos`;
      byId('incomeBar').style.width = `${Math.min(incomePct, 100)}%`;
      byId('incomeBar').textContent = `${incomePct}%`;
      byId('expenseBar').style.width = `${Math.min(expensePct, 100)}%`;
      byId('expenseBar').textContent = `${expensePct}%`;
      byId('balanceBar').style.width = `${Math.min(balancePct, 100)}%`;
      byId('balanceBar').textContent = `${balancePct}%`;
      byId('pendingBar').style.width = `${chartRows.length ? 100 : 0}%`;
      byId('pendingBar').textContent = String(chartRows.length);
      byId('rangeLabel').textContent = `${filterStart} a ${filterEnd}`;
      renderFilterState();
      renderCardContext();
      if (!byId('launchesScreen')?.hidden) syncLaunchFiltersFromMain();
      renderMonthlySummary();

      const daily = new Map();
      for (const tx of chartRows) {
        if (!isOperatingExpense(tx)) continue;
        const viewDate = dateForView(tx);
        daily.set(viewDate, (daily.get(viewDate) || 0) + money(tx.valor));
      }
      const dailyEntries = dateRange(filterStart, filterEnd).map((day) => [day, daily.get(day) || 0]);
      renderChart('dailyChart', {
        type: 'bar',
        data: { labels: dailyEntries.map(x => shortDate(x[0])), datasets: [{ label: 'Gastos', data: dailyEntries.map(x => x[1]), backgroundColor: '#2563eb', borderRadius: 5, maxBarThickness: 22 }] },
        options: {
          ...commonChartOptions,
          plugins: { ...commonChartOptions.plugins, legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
            y: { beginAtZero: true, ticks: { maxTicksLimit: 5, callback: (v) => fmt.format(v) } }
          }
        }
      });

      const groups = sumBy(chartRows, 'grupo');
      renderChart('groupChart', {
        type: 'doughnut',
        data: { labels: groups.map(x => x[0]), datasets: [{ data: groups.map(x => x[1]), backgroundColor: palette }] },
        options: commonChartOptions
      });

      const categories = sumBy(chartRows, 'categoria').slice(0, 10);
      renderChart('categoryChart', {
        type: 'doughnut',
        data: { labels: categories.map(x => x[0]), datasets: [{ data: categories.map(x => x[1]), backgroundColor: palette }] },
        options: commonChartOptions
      });

      const accounts = sumBy(chartRows, 'conta');
      renderChart('accountChart', {
        type: 'bar',
        data: { labels: accounts.map(x => x[0]), datasets: [{ label: 'Gastos', data: accounts.map(x => x[1]), backgroundColor: '#0d7a6f' }] },
        options: {
          ...commonChartOptions,
          plugins: { ...commonChartOptions.plugins, legend: { display: false } },
          scales: {
            x: { ticks: { maxRotation: 0, autoSkip: false, callback: function(value) {
              const label = this.getLabelForValue(value);
              return label.length > 16 ? `${label.slice(0, 16)}...` : label;
            } } },
            y: { beginAtZero: true, ticks: { maxTicksLimit: 5, callback: (v) => fmt.format(v) } }
          }
        }
      });

      const users = sumBy(chartRows, 'usuario');
      renderChart('userChart', {
        type: 'bar',
        data: { labels: users.map(x => x[0]), datasets: [{ label: 'Gastos', data: users.map(x => x[1]), backgroundColor: '#7c3aed', borderRadius: 5, maxBarThickness: 26 }] },
        options: {
          ...commonChartOptions,
          plugins: { ...commonChartOptions.plugins, legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false } },
            y: { beginAtZero: true, ticks: { maxTicksLimit: 4, callback: (v) => fmt.format(v) } }
          }
        }
      });

	      byId('rows').innerHTML = rows.map(renderEditableRow).join('');
	      byId('txCards').innerHTML = rows.map(renderEditableCard).join('');
	      updateSortHeaderState();
	      renderLaunchSummary(rows);
	      updateBatchState();
	    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function inputHtml(tx, field, type = 'text', extraClass = '') {
      return `<input class="edit-field ${extraClass}" data-id="${tx.id}" data-field="${field}" type="${type}" value="${escapeHtml(workingValue(tx, field))}">`;
    }

    function categorySelect(tx) {
      return `<select class="edit-field" data-id="${tx.id}" data-field="categoria_id">${categoryOptions(workingValue(tx, 'categoria_id'), 'Categoria')}</select>`;
    }

    function accountSelect(tx) {
      return `<select class="edit-field" data-id="${tx.id}" data-field="conta_id">${optionList(DASHBOARD.accounts, 'id', 'nome', workingValue(tx, 'conta_id'))}</select>`;
    }

    function userSelect(tx) {
      return `<select class="edit-field" data-id="${tx.id}" data-field="usuario_lancamento_id">${optionList(DASHBOARD.users, 'id', 'nome', workingValue(tx, 'usuario_lancamento_id'))}</select>`;
    }

    function statementLabel(tx) {
      if (!tx.fatura_id) return '';
      const parts = [`Fatura #${tx.fatura_id}`];
      if (tx.fatura_vencimento) parts.push(`vence ${shortDate(tx.fatura_vencimento)}`);
      else if (tx.competencia_mes) parts.push(shortMonth(tx.competencia_mes));
      return `Conciliada · ${parts.join(' · ')}`;
    }

    function statementBadgeHtml(tx) {
      const label = statementLabel(tx);
      if (!label) return '';
      const titleParts = [label];
      if (tx.fatura_periodo_inicio && tx.fatura_periodo_fim) {
        titleParts.push(`Período ${shortDate(tx.fatura_periodo_inicio)} a ${shortDate(tx.fatura_periodo_fim)}`);
      }
      return `<span class="statement-badge" title="${escapeHtml(titleParts.join(' · '))}">${escapeHtml(label)}</span>`;
    }

    function idCellHtml(tx) {
      const badge = statementBadgeHtml(tx);
      return `#${tx.id}${badge ? `<br>${badge}` : ''}`;
    }

    function renderEditableRow(tx) {
      return `
        <tr data-row-id="${tx.id}" class="${hasChanges(tx.id) ? 'changed' : ''}">
          <td class="id-cell">${idCellHtml(tx)}</td>
          <td>${inputHtml(tx, 'data', 'date')}</td>
          <td>${inputHtml(tx, 'descricao', 'text', 'description')}</td>
          <td>${categorySelect(tx)}</td>
          <td>${accountSelect(tx)}</td>
          <td>${userSelect(tx)}</td>
          <td>${inputHtml(tx, 'valor', 'text', 'value')}</td>
        </tr>
      `;
    }

    function renderEditableCard(tx) {
      return `
        <article class="tx-card ${hasChanges(tx.id) ? 'changed' : ''}" data-card-id="${tx.id}">
          <div class="tx-card-top">
            <div>
              <div class="tx-date tx-date-row"><span>#${tx.id} · ${shortDate(tx.data)}</span>${statementBadgeHtml(tx)}</div>
              <div class="tx-desc">${escapeHtml(tx.descricao)}</div>
            </div>
            <div class="tx-money">${fmt.format(money(tx.valor))}</div>
          </div>
          <div class="tx-edit-grid">
            <label>Data ${inputHtml(tx, 'data', 'date')}</label>
            <label>Valor ${inputHtml(tx, 'valor', 'text', 'value')}</label>
            <label>Descrição ${inputHtml(tx, 'descricao', 'text', 'description')}</label>
            <label>Categoria ${categorySelect(tx)}</label>
            <label>Conta ${accountSelect(tx)}</label>
            <label>Usuário ${userSelect(tx)}</label>
          </div>
        </article>
      `;
    }

    function updateFieldMirrors(id, field, value, source) {
      document.querySelectorAll(`.edit-field[data-id="${CSS.escape(String(id))}"][data-field="${field}"]`).forEach((fieldEl) => {
        if (fieldEl !== source) fieldEl.value = value;
      });
    }

    function queueChange(input, formatMoney = false) {
      const id = String(input.dataset.id || '');
      const field = input.dataset.field || '';
      const tx = originalTx(id);
      if (!tx || !field) return;
      const value = field === 'valor' && !formatMoney ? input.value : normalizeFieldValue(field, input.value);
      input.value = value;
      const current = { ...editedFields(id) };
      if (fieldChanged(tx, field, value)) current[field] = value;
      else delete current[field];
      if (Object.keys(current).length) edits.set(id, current);
      else edits.delete(id);
      updateFieldMirrors(id, field, value, input);
      document.querySelector(`[data-row-id="${CSS.escape(id)}"]`)?.classList.toggle('changed', hasChanges(id));
      document.querySelector(`[data-card-id="${CSS.escape(id)}"]`)?.classList.toggle('changed', hasChanges(id));
      updateBatchState();
    }

    function changedPayload() {
      return [...edits.entries()].map(([id, fields]) => ({ id: Number(id), fields }));
    }

    function updateBatchState() {
      const count = edits.size;
      byId('batchCount').textContent = `${count} alterada${count === 1 ? '' : 's'}`;
      byId('generateBatch').disabled = count === 0;
    }

    function buildBatchMessage() {
      const changes = changedPayload();
      const lines = [
        `Editar ${changes.length} lançamento(s) familiar(es) abaixo. Quero uma única confirmação antes de aplicar.`,
        '',
        'PEDIDO_EDICAO_FAMILIAR',
        '```json',
        JSON.stringify({ action: 'editar_lancamentos_familiares', changes }, null, 2),
        '```'
      ];
      return lines.join('\\n');
    }

    async function postDashboard(path, body) {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      let data = {};
      try { data = await response.json(); } catch {}
      if (!response.ok) throw new Error(data.message || `Falha HTTP ${response.status}`);
      return data;
    }

    async function refreshDashboardData() {
      const button = byId('topRefresh');
      const previousLabel = button.textContent;
      button.disabled = true;
      button.textContent = 'Atualizando...';
      try {
        const response = await fetch(`/financeiro-familiar/dashboard/data?token=${encodeURIComponent(dashboardToken())}`, {
          headers: { 'Accept': 'application/json' },
        });
        let data = {};
        try { data = await response.json(); } catch {}
        if (!response.ok) throw new Error(data.message || `Falha HTTP ${response.status}`);
        DASHBOARD = data;
        byId('generatedAt').textContent = DASHBOARD.generatedAt;
        refreshFilterOptions();
        initStatementCloseControls();
        renderNewRows();
        if (!byId('accountsScreen').hidden) refreshAccountsAdmin();
        if (!byId('categoriesScreen').hidden) renderCategories();
        render();
      } catch (error) {
        alert(error.message || String(error));
      } finally {
        button.disabled = false;
        button.textContent = previousLabel;
      }
    }

    const sectionTitles = {
      accounts: 'Contas',
      categories: 'Categorias',
      launches: 'Lançamentos',
      dashboard: 'Dashboard',
    };

    function setActiveSection(section) {
      const active = ['accounts', 'categories', 'launches', 'dashboard'].includes(section) ? section : 'dashboard';
      if (active === 'dashboard' && drilldownActive) resetDashboardFilters();
      byId('accountsScreen').hidden = active !== 'accounts';
      byId('categoriesScreen').hidden = active !== 'categories';
      byId('launchesScreen').hidden = active !== 'launches';
      byId('dashboardScreen').hidden = active !== 'dashboard';
      byId('pageTitle').textContent = sectionTitles[active] || sectionTitles.dashboard;
      byId('topRefresh').hidden = active !== 'dashboard';
      document.querySelectorAll('.nav-steps button[data-section]').forEach((button) => {
        button.classList.toggle('active', button.dataset.section === active);
      });
      if (active === 'accounts') {
        if (!ACCOUNT_ADMIN.users.length) refreshAccountsAdmin().catch((error) => {
          byId('accountAdminMessage').textContent = error.message || String(error);
          byId('accountAdminMessage').className = 'config-message warn';
        });
        else renderAccounts();
      }
      if (active === 'categories') {
        if (!CATEGORY_ADMIN.groups.length) refreshCategoriesAdmin().catch((error) => {
          byId('categoryAdminMessage').textContent = error.message || String(error);
          byId('categoryAdminMessage').className = 'config-message warn';
        });
        else renderCategories();
      }
      if (active === 'launches') {
        syncLaunchFiltersFromMain();
        render();
      }
      if (active === 'dashboard') render();
    }

    let ACCOUNT_ADMIN = { users: [], items: [] };

    function accountRowDirty(row, dirty = true) {
      row?.classList?.toggle('changed', dirty);
      const button = row?.querySelector?.('.save-account');
      if (button) {
        button.classList.toggle('dirty', dirty);
        button.textContent = dirty ? 'Salvar' : 'Salvo';
      }
    }

    function accountTypeOptions(selected = '') {
      const labels = {
        conta_corrente: 'Conta corrente',
        cartao_credito: 'Cartão de crédito',
        caixa: 'Caixa',
        poupanca: 'Poupança',
      };
      return Object.entries(labels).map(([value, label]) => (
        `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`
      )).join('');
    }

    function accountUserOptions(selected = '') {
      return '<option value="">Sem titular</option>' + ACCOUNT_ADMIN.users
        .filter((user) => user.ativo !== false)
        .map((user) => `<option value="${escapeHtml(user.id)}"${String(user.id) === String(selected ?? '') ? ' selected' : ''}>${escapeHtml(user.nome)}</option>`)
        .join('');
    }

    function renderAccountCreateOptions() {
      byId('newAccountOwner').innerHTML = accountUserOptions(byId('newAccountOwner').value || ACCOUNT_ADMIN.users[0]?.id || '');
    }

    function renderAccounts() {
      renderAccountCreateOptions();
      const wrap = byId('accountRows');
      const rows = [...ACCOUNT_ADMIN.items].sort((a, b) => `${a.ativa === false ? '1' : '0'} ${a.tipo} ${a.nome}`.localeCompare(`${b.ativa === false ? '1' : '0'} ${b.tipo} ${b.nome}`, 'pt-BR'));
      if (!rows.length) {
        wrap.innerHTML = '<tr><td colspan="12" class="muted">Nenhuma conta cadastrada.</td></tr>';
        return;
      }
      const activeRows = rows.filter((account) => account.ativa !== false).length;
      byId('accountAdminMessage').textContent = `${rows.length} contas carregadas · ${activeRows} ativas. Edite uma linha e clique em Salvar na coluna Ação.`;
      byId('accountAdminMessage').className = 'config-message';
      wrap.innerHTML = rows.map((account) => {
        const card = account.card || {};
        const isCard = account.tipo === 'cartao_credito';
        return `
          <tr class="${account.ativa === false ? 'inactive' : ''} ${isCard ? 'credit-card' : ''}" data-account-id="${escapeHtml(account.id)}">
            <td><input class="account-name-field" data-account-field="nome" value="${escapeHtml(account.nome)}"></td>
            <td><select data-account-field="tipo">${accountTypeOptions(account.tipo)}</select></td>
            <td><select data-account-field="titular_usuario_id">${accountUserOptions(account.titular_usuario_id)}</select></td>
            <td><select data-account-field="ativa">
              <option value="true"${account.ativa !== false ? ' selected' : ''}>Ativa</option>
              <option value="false"${account.ativa === false ? ' selected' : ''}>Inativa</option>
            </select></td>
            <td class="usage-cell">${account.usage_count || 0} lanç. · ${fmt.format(money(account.usage_total))}</td>
            <td class="card-only"><input data-card-field="bandeira" value="${escapeHtml(card.bandeira || '')}" placeholder="Visa"></td>
            <td class="card-only"><input class="compact-field" data-card-field="final_cartao" inputmode="numeric" maxlength="4" value="${escapeHtml(card.final_cartao || '')}"></td>
            <td class="card-only"><input class="compact-field" data-card-field="dia_fechamento" type="number" min="1" max="31" value="${escapeHtml(card.dia_fechamento || '')}"></td>
            <td class="card-only"><input class="compact-field" data-card-field="dia_vencimento" type="number" min="1" max="31" value="${escapeHtml(card.dia_vencimento || '')}"></td>
            <td class="card-only"><input class="compact-field" data-card-field="tolerancia_diferenca" value="${escapeHtml(brMoneyInput(card.tolerancia_diferenca || '10.00'))}"></td>
            <td class="card-only"><input class="alias-field" data-card-field="apelidos" value="${escapeHtml((card.apelidos || []).join(', '))}"></td>
            <td><div class="account-row-actions"><button class="account-save-button save-account" data-account-id="${escapeHtml(account.id)}">Salvo</button></div></td>
          </tr>
        `;
      }).join('');
    }

    async function refreshAccountsAdmin() {
      const response = await fetch(`/financeiro-familiar/dashboard/accounts?token=${encodeURIComponent(dashboardToken())}`, {
        headers: { 'Accept': 'application/json' },
      });
      let data = {};
      try { data = await response.json(); } catch {}
      if (!response.ok) throw new Error(data.message || `Falha HTTP ${response.status}`);
      ACCOUNT_ADMIN = { users: data.users || [], items: data.items || [] };
      renderAccounts();
    }

    function accountPayload(accountId = '') {
      if (!accountId) {
        return {
          nome: byId('newAccountName').value,
          tipo: byId('newAccountType').value,
          titular_usuario_id: byId('newAccountOwner').value,
          ativa: byId('newAccountActive').value !== 'false',
          card: {},
        };
      }
      const row = document.querySelector(`[data-account-id="${CSS.escape(String(accountId))}"]`);
      const value = (field) => row?.querySelector(`[data-account-field="${field}"]`)?.value ?? '';
      const cardValue = (field) => row?.querySelector(`[data-card-field="${field}"]`)?.value ?? '';
      return {
        id: Number(accountId),
        nome: value('nome'),
        tipo: value('tipo'),
        titular_usuario_id: value('titular_usuario_id'),
        ativa: value('ativa') !== 'false',
        card: {
          bandeira: cardValue('bandeira'),
          final_cartao: cardValue('final_cartao'),
          dia_fechamento: cardValue('dia_fechamento'),
          dia_vencimento: cardValue('dia_vencimento'),
          tolerancia_diferenca: cardValue('tolerancia_diferenca'),
          apelidos: cardValue('apelidos'),
          ativo: value('ativa') !== 'false',
        },
      };
    }

    async function saveAccount(accountId = '') {
      const message = byId('accountAdminMessage');
      message.textContent = 'Salvando...';
      message.className = 'config-message';
      try {
        const result = await postDashboard('/financeiro-familiar/dashboard/accounts', {
          token: dashboardToken(),
          payload: accountPayload(accountId),
        });
        message.textContent = result.message || 'Conta salva.';
        message.className = 'config-message ok';
        if (!accountId) {
          byId('newAccountName').value = '';
          byId('newAccountType').value = 'conta_corrente';
          byId('newAccountActive').value = 'true';
        }
        await refreshAccountsAdmin();
        await refreshDashboardData();
      } catch (error) {
        message.textContent = error.message || String(error);
        message.className = 'config-message warn';
      }
    }

    let CATEGORY_ADMIN = { groups: [], items: [] };

    function categoryGroupOptions(selected = '') {
      return CATEGORY_ADMIN.groups
        .filter((group) => group.ativo !== false)
        .map((group) => `<option value="${escapeHtml(group.id)}"${String(group.id) === String(selected ?? '') ? ' selected' : ''}>${escapeHtml(group.nome)}</option>`)
        .join('');
    }

    function renderCategoryGroupOptions() {
      const select = byId('categoryGroupView');
      const selected = select.value || '';
      const groups = CATEGORY_ADMIN.groups.filter((group) => group.ativo !== false);
      select.innerHTML = '<option value="">Todos os grupos</option>' + groups.map((group) => `<option value="${escapeHtml(group.nome)}">${escapeHtml(group.nome)}</option>`).join('');
      select.value = groups.some((group) => group.nome === selected) ? selected : '';
      byId('newCategoryGroup').innerHTML = categoryGroupOptions(byId('newCategoryGroup').value || groups[0]?.id || '');
    }

    function renderCategories() {
      renderCategoryGroupOptions();
      const wrap = byId('categoryRows');
      const search = norm(byId('categorySearch')?.value || '');
      const selectedGroup = byId('categoryGroupView')?.value || '';
      const rows = CATEGORY_ADMIN.items.filter((cat) => {
        const haystack = norm(`${cat.nome} ${cat.grupo} ${cat.tipo_padrao} ${(cat.palavras_chave || []).join(' ')}`);
        if (selectedGroup && cat.grupo !== selectedGroup) return false;
        if (search && !haystack.includes(search)) return;
        return true;
      }).sort((a, b) => `${a.grupo} ${a.nome}`.localeCompare(`${b.grupo} ${b.nome}`, 'pt-BR'));
      if (!rows.length) {
        wrap.innerHTML = '<tr><td colspan="7" class="muted">Nenhuma categoria encontrada.</td></tr>';
        return;
      }
      wrap.innerHTML = rows.map((cat) => `
        <tr class="${cat.ativa === false ? 'inactive' : ''}" data-category-id="${escapeHtml(cat.id)}">
          <td><input data-category-field="nome" value="${escapeHtml(cat.nome)}"></td>
          <td><select data-category-field="grupo_id">${categoryGroupOptions(cat.grupo_id)}</select></td>
          <td><select data-category-field="tipo_padrao">
            <option value="variavel"${cat.tipo_padrao === 'variavel' ? ' selected' : ''}>Variável</option>
            <option value="fixo"${cat.tipo_padrao === 'fixo' ? ' selected' : ''}>Fixo</option>
            <option value="projeto"${cat.tipo_padrao === 'projeto' ? ' selected' : ''}>Projeto</option>
          </select></td>
          <td><input class="keyword-field" data-category-field="palavras_chave" value="${escapeHtml((cat.palavras_chave || []).join(', '))}"></td>
          <td><select data-category-field="ativa">
            <option value="true"${cat.ativa !== false ? ' selected' : ''}>Ativa</option>
            <option value="false"${cat.ativa === false ? ' selected' : ''}>Inativa</option>
          </select></td>
          <td class="usage-cell">${cat.usage_count || 0} lanç. · ${fmt.format(money(cat.usage_total))}</td>
          <td><button class="primary save-category" data-category-id="${escapeHtml(cat.id)}">Salvar</button></td>
        </tr>
      `).join('');
    }

    async function refreshCategoriesAdmin() {
      const response = await fetch(`/financeiro-familiar/dashboard/categories?token=${encodeURIComponent(dashboardToken())}`, {
        headers: { 'Accept': 'application/json' },
      });
      let data = {};
      try { data = await response.json(); } catch {}
      if (!response.ok) throw new Error(data.message || `Falha HTTP ${response.status}`);
      CATEGORY_ADMIN = { groups: data.groups || [], items: data.items || [] };
      renderCategories();
    }

    function categoryPayload(categoryId = '') {
      if (!categoryId) {
        return {
          nome: byId('newCategoryName').value,
          grupo_id: byId('newCategoryGroup').value,
          tipo_padrao: byId('newCategoryType').value,
          palavras_chave: byId('newCategoryKeywords').value,
          ativa: true,
        };
      }
      const row = document.querySelector(`[data-category-id="${CSS.escape(String(categoryId))}"]`);
      const value = (field) => row?.querySelector(`[data-category-field="${field}"]`)?.value ?? '';
      return {
        id: Number(categoryId),
        nome: value('nome'),
        grupo_id: value('grupo_id'),
        tipo_padrao: value('tipo_padrao'),
        palavras_chave: value('palavras_chave'),
        ativa: value('ativa') !== 'false',
      };
    }

    async function saveCategory(categoryId = '') {
      const message = byId('categoryAdminMessage');
      message.textContent = 'Salvando...';
      message.className = 'config-message';
      try {
        const result = await postDashboard('/financeiro-familiar/dashboard/categories', {
          token: dashboardToken(),
          payload: categoryPayload(categoryId),
        });
        message.textContent = result.message || 'Categoria salva.';
        message.className = 'config-message ok';
        if (!categoryId) {
          byId('newCategoryName').value = '';
          byId('newCategoryKeywords').value = '';
          byId('newCategoryType').value = 'variavel';
        }
        await refreshCategoriesAdmin();
        await refreshDashboardData();
      } catch (error) {
        message.textContent = error.message || String(error);
        message.className = 'config-message warn';
      }
    }

    function reconciliationList(items, renderer, emptyText) {
      const rows = Array.isArray(items) ? items : [];
      if (!rows.length) return `<ul><li>${escapeHtml(emptyText)}</li></ul>`;
      return `<ul>${rows.slice(0, 8).map((item) => `<li>${renderer(item)}</li>`).join('')}${rows.length > 8 ? `<li>+ ${rows.length - 8} item(ns)</li>` : ''}</ul>`;
    }

    function renderStatementReconciliation(data) {
      if (!data || !Object.keys(data).length) return '';
      const missing = data.na_fatura_nao_lancados || [];
      const extra = data.lancados_fora_fatura || [];
      const diffs = data.divergencias_valor || [];
      const hasIssues = missing.length || extra.length || diffs.length;
      const missingList = reconciliationList(
        missing,
        (item) => `${escapeHtml(shortDate(item.data) || `dia ${item.day}`)} · ${fmt.format(money(item.valor))}${item.descricao ? ` · ${escapeHtml(item.descricao)}` : ''}`,
        'Nenhum item da fatura ficou sem lançamento.'
      );
      const extraList = reconciliationList(
        extra,
        (item) => `#${escapeHtml(item.id)} · ${escapeHtml(shortDate(item.data))} · ${fmt.format(money(item.valor))} · ${escapeHtml(item.descricao)}`,
        'Nenhum lançamento interno ficou fora da fatura colada.'
      );
      const diffList = reconciliationList(
        diffs,
        (item) => {
          const invoice = item.fatura || {};
          const launch = item.lancamento || {};
          return `${escapeHtml(shortDate(invoice.data))} · fatura ${fmt.format(money(invoice.valor))} x #${escapeHtml(launch.id)} ${fmt.format(money(launch.valor))} · dif. ${fmt.format(money(item.diferenca))}`;
        },
        'Nenhuma divergência de valor no mesmo dia.'
      );
      return `
        <div class="reconciliation-block">
          <div><strong>Conferência com a fatura colada</strong> <span class="muted">${data.conferidos || 0}/${data.itens_fatura || 0} item(ns) batem exatamente.</span></div>
          <div class="reconciliation-grid">
            <div class="reconciliation-card ${missing.length ? 'warn' : ''}"><strong>Na fatura, não lançado</strong>${missingList}</div>
            <div class="reconciliation-card ${extra.length ? 'warn' : ''}"><strong>Lançado, não está na fatura</strong>${extraList}</div>
            <div class="reconciliation-card ${diffs.length ? 'warn' : ''}"><strong>Valor divergente</strong>${diffList}</div>
          </div>
          ${hasIssues ? '<div class="warn">Revise os itens acima antes de confirmar a conciliação.</div>' : ''}
        </div>
      `;
    }

    function renderConfirmationPreview(preview, fallbackMessage = '') {
      const wrap = byId('confirmationTableWrap');
      const rows = Array.isArray(preview?.rows) ? preview.rows : [];
      if (!rows.length) {
        wrap.innerHTML = `<div style="padding: 12px; white-space: pre-wrap;">${escapeHtml(fallbackMessage || 'Operação preparada.')}</div>`;
        return;
      }
      if (preview.kind === 'statement') {
        const summary = preview.summary || {};
        const diff = money(summary.diferenca);
        const heading = '<tr><th>ID</th><th>Data</th><th>Descrição</th><th>Valor</th><th>Categoria</th><th>Conta</th><th>Usuário</th></tr>';
        const body = rows.map((row) => `
          <tr>
            <td class="id-cell">#${escapeHtml(row.id)}</td>
            <td class="date-cell">${escapeHtml(shortDate(row.data))}</td>
            <td>${escapeHtml(row.descricao)}</td>
            <td class="money">${fmt.format(money(row.valor))}</td>
            <td>${escapeHtml(row.categoria)}</td>
            <td>${escapeHtml(row.conta)}</td>
            <td>${escapeHtml(row.usuario)}</td>
          </tr>
        `).join('');
        wrap.innerHTML = `
          <div class="statement-confirm-summary">
            <div class="statement-confirm-item">
              <div class="statement-confirm-label">Cartão</div>
              <div class="statement-confirm-value">${escapeHtml(summary.conta || 'Fatura')}</div>
            </div>
            <div class="statement-confirm-item">
              <div class="statement-confirm-label">Período</div>
              <div class="statement-confirm-value">${escapeHtml(formatStatementPeriod(summary.periodo))}</div>
            </div>
            <div class="statement-confirm-item">
              <div class="statement-confirm-label">Vencimento</div>
              <div class="statement-confirm-value">${escapeHtml(shortDate(summary.vencimento))}</div>
            </div>
            <div class="statement-confirm-item">
              <div class="statement-confirm-label">Fatura</div>
              <div class="statement-confirm-value">${fmt.format(money(summary.valor_fatura))}</div>
            </div>
            <div class="statement-confirm-item">
              <div class="statement-confirm-label">Lançamentos</div>
              <div class="statement-confirm-value">${fmt.format(money(summary.valor_lancamentos))}</div>
            </div>
            <div class="statement-confirm-item">
              <div class="statement-confirm-label">Diferença</div>
              <div class="statement-confirm-value ${Math.abs(diff) >= 0.005 ? 'warn' : ''}">${fmt.format(diff)}</div>
            </div>
          </div>
          ${renderStatementReconciliation(preview.reconciliation)}
          <table class="confirmation-table"><thead>${heading}</thead><tbody>${body}</tbody></table>
        `;
        return;
      }
      const isEdit = preview.kind === 'edit';
      const heading = isEdit
        ? '<tr><th>ID</th><th>Data</th><th>Descrição</th><th>Valor</th><th>Categoria</th><th>Conta</th><th>Usuário</th></tr>'
        : '<tr><th>#</th><th>Data</th><th>Descrição</th><th>Valor</th><th>Categoria</th><th>Conta</th><th>Usuário</th></tr>';
      const body = rows.map((row) => `
        <tr>
          <td>${escapeHtml(isEdit ? row.id : row.index)}</td>
          <td>${escapeHtml(row.data)}</td>
          <td>${escapeHtml(row.descricao)}</td>
          <td class="money">${escapeHtml(row.valor)}</td>
          <td>${escapeHtml(row.categoria)}</td>
          <td>${escapeHtml(row.conta)}</td>
          <td>${escapeHtml(row.usuario)}</td>
        </tr>
      `).join('');
      wrap.innerHTML = `<table class="confirmation-table"><thead>${heading}</thead><tbody>${body}</tbody></table>`;
    }

    async function prepareOperation(kind) {
      const isInsert = kind === 'insert';
      const marker = isInsert ? 'PEDIDO_INCLUSAO_LOTE_FAMILIAR' : 'PEDIDO_EDICAO_FAMILIAR';
      const payload = isInsert ? insertPayload() : { action: 'editar_lancamentos_familiares', changes: changedPayload() };
      pendingConfirmation = null;
      pendingOperationKind = kind;
      byId('dialogTitle').textContent = isInsert ? 'Confirmar inclusão' : 'Confirmar edição';
      byId('dialogIntro').textContent = 'Validando no backend. Nenhuma alteração foi gravada ainda.';
      byId('editCommand').value = 'Preparando...';
      byId('confirmationTableWrap').innerHTML = '<div style="padding: 12px;">Preparando...</div>';
      byId('copyStatus').textContent = '';
      byId('confirmCommand').disabled = true;
      if (isInsert && byId('insertDialog').open) byId('insertDialog').close();
      byId('editDialog').showModal();
      try {
        const result = await postDashboard('/financeiro-familiar/dashboard/prepare', {
          token: dashboardToken(),
          marker,
          payload,
        });
        pendingConfirmation = result.confirmation_id;
        byId('dialogIntro').textContent = 'Confira o resumo. A gravação só acontece ao confirmar aqui.';
        byId('editCommand').value = result.message || 'Operação preparada.';
        renderConfirmationPreview(result.preview, result.message || 'Operação preparada.');
        byId('confirmCommand').disabled = !pendingConfirmation;
      } catch (error) {
        byId('dialogIntro').textContent = 'A validação encontrou um problema.';
        byId('editCommand').value = error.message || String(error);
        renderConfirmationPreview(null, error.message || String(error));
      }
    }

    async function prepareStatementClose() {
      pendingConfirmation = null;
      pendingOperationKind = 'statement';
      const status = byId('statementCloseStatus');
      const button = byId('prepareStatementClose');
      const previousLabel = button.textContent;
      button.disabled = true;
      button.textContent = 'Revisando...';
      status.textContent = '';
      status.className = 'statement-close-status';
      byId('dialogTitle').textContent = 'Confirmar fatura';
      byId('dialogIntro').textContent = 'Validando fatura e lançamentos no backend. Nada foi gravado ainda.';
      byId('editCommand').value = 'Preparando...';
      byId('confirmationTableWrap').innerHTML = '<div style="padding: 12px;">Preparando...</div>';
      byId('copyStatus').textContent = '';
      byId('confirmCommand').disabled = true;
      byId('editDialog').showModal();
      try {
        const result = await postDashboard('/financeiro-familiar/dashboard/statement/prepare', {
          token: dashboardToken(),
          payload: statementClosePayload(),
        });
        pendingConfirmation = result.confirmation_id;
        byId('dialogIntro').textContent = 'Confira a fatura. A conciliação só acontece ao confirmar aqui.';
        byId('editCommand').value = result.message || 'Fechamento preparado.';
        renderConfirmationPreview(result.preview, result.message || 'Fechamento preparado.');
        byId('confirmCommand').disabled = !pendingConfirmation;
        status.textContent = 'Fatura preparada para revisão.';
      } catch (error) {
        const message = error.message || String(error);
        byId('dialogIntro').textContent = 'A validação encontrou um problema.';
        byId('editCommand').value = message;
        renderConfirmationPreview(null, message);
        status.textContent = message;
        status.className = 'statement-close-status warn';
      } finally {
        button.disabled = false;
        button.textContent = previousLabel;
      }
    }

    async function confirmPreparedOperation() {
      if (!pendingConfirmation) return;
      const button = byId('confirmCommand');
      const previousLabel = button.textContent;
      button.disabled = true;
      button.textContent = 'Gravando...';
      byId('dialogIntro').textContent = 'Gravando no backend. Aguarde a confirmação.';
      byId('copyStatus').textContent = 'Gravando...';
      try {
        const result = await postDashboard('/financeiro-familiar/dashboard/commit', {
          token: dashboardToken(),
          confirmation_id: pendingConfirmation,
        });
        byId('dialogIntro').textContent = 'Gravação concluída.';
        byId('copyStatus').textContent = result.message || 'Operação gravada.';
        byId('editCommand').value = result.message || 'Operação gravada.';
        renderConfirmationPreview(null, result.message || 'Operação gravada.');
        pendingConfirmation = null;
        const wasStatement = pendingOperationKind === 'statement';
        pendingOperationKind = '';
        button.textContent = 'Gravado';
        edits.clear();
        newRows.splice(0, newRows.length);
        renderNewRows();
        updateBatchState();
        if (wasStatement) {
          byId('statementCloseStatus').textContent = result.message || 'Operação gravada.';
          byId('statementCloseStatus').className = 'statement-close-status';
        }
        await refreshDashboardData();
      } catch (error) {
        const message = error.message || String(error);
        byId('dialogIntro').textContent = 'A gravação encontrou um problema.';
        byId('copyStatus').textContent = message;
        byId('editCommand').value = message;
        renderConfirmationPreview(null, message);
        if (pendingOperationKind === 'statement') {
          byId('statementCloseStatus').textContent = message;
          byId('statementCloseStatus').className = 'statement-close-status warn';
        }
        button.disabled = false;
        button.textContent = previousLabel;
      }
    }

    function initNewEntryControls() {
      const defaultUser = DASHBOARD.users.find((item) => String(item.nome || '').toLowerCase() === 'matheus') || DASHBOARD.users[0] || {};
      byId('newUser').innerHTML = optionListWithBlank(DASHBOARD.users, 'id', 'nome', defaultUser.id || '', 'Usuário');
      byId('newDefaultAccount').innerHTML = optionListWithBlank(DASHBOARD.accounts, 'id', 'nome', '', 'Conta padrão');
      byId('newDefaultCategory').innerHTML = categoryOptions('', 'Categoria padrão');
      renderNewRows();
    }

    byId('generatedAt').textContent = DASHBOARD.generatedAt;
    byId('start').value = DASHBOARD.defaultStart;
    byId('end').value = DASHBOARD.defaultEnd;
	    byId('dateBasis').value = 'effective';
	    syncDateBasisSwitch();
	    byId('launchDateBasis').value = 'effective';
	    syncLaunchDateBasisSwitch();
	    initNewEntryControls();
	    initStatementCloseControls();
    refreshFilterOptions();
    document.querySelectorAll('.nav-steps button[data-section]').forEach((button) => {
      button.addEventListener('click', () => setActiveSection(button.dataset.section || 'dashboard'));
    });
    byId('reloadAccounts').addEventListener('click', async () => {
      try { await refreshAccountsAdmin(); } catch (error) {
        byId('accountAdminMessage').textContent = error.message || String(error);
        byId('accountAdminMessage').className = 'config-message warn';
      }
    });
    byId('createAccount').addEventListener('click', () => saveAccount(''));
    byId('accountRows').addEventListener('click', (event) => {
      const button = event.target?.closest?.('.save-account');
      if (button) saveAccount(button.dataset.accountId || '');
    });
    byId('accountRows').addEventListener('change', (event) => {
      if (event.target?.dataset?.accountField === 'tipo') {
        event.target.closest('tr')?.classList.toggle('credit-card', event.target.value === 'cartao_credito');
      }
      if (event.target?.matches?.('[data-account-field], [data-card-field]')) {
        accountRowDirty(event.target.closest('tr'), true);
      }
    });
    byId('accountRows').addEventListener('input', (event) => {
      if (event.target?.matches?.('[data-account-field], [data-card-field]')) {
        accountRowDirty(event.target.closest('tr'), true);
      }
    });
    byId('categorySearch').addEventListener('input', renderCategories);
    byId('categoryGroupView').addEventListener('change', renderCategories);
    byId('createCategory').addEventListener('click', () => saveCategory(''));
    byId('categoryRows').addEventListener('click', (event) => {
      const button = event.target?.closest?.('.save-category');
      if (button) saveCategory(button.dataset.categoryId || '');
    });
    byId('topRefresh').addEventListener('click', refreshDashboardData);
    byId('search').addEventListener('input', render);
    document.querySelectorAll('[data-period-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        const [start, end] = periodPresetRange(button.dataset.periodPreset);
        byId('start').value = start;
        byId('end').value = end;
        refreshFilterOptions();
        render();
      });
    });
    ['start', 'end'].forEach((id) => byId(id).addEventListener('change', () => {
      refreshFilterOptions();
      render();
    }));
    byId('clearFilters').addEventListener('click', () => {
      resetDashboardFilters();
      render();
    });
    ['dateBasis', 'groupFilter', 'categoryFilter', 'accountFilter', 'userFilter', 'typeFilter', 'sortOrder'].forEach((id) => byId(id).addEventListener('change', () => {
      if (id === 'dateBasis') syncDateBasisSwitch();
      if (id === 'groupFilter' || id === 'dateBasis') refreshFilterOptions();
      render();
    }));
	    ['launchStart', 'launchEnd', 'launchGroupFilter', 'launchCategoryFilter', 'launchAccountFilter', 'launchUserFilter', 'launchTypeFilter', 'sortOrder'].forEach((id) => {
	      byId(id).addEventListener('change', applyLaunchFiltersToMain);
	    });
	    byId('launchDateBasis').addEventListener('change', () => {
	      syncLaunchDateBasisSwitch();
	      applyLaunchFiltersToMain();
	    });
	    byId('launchSearch').addEventListener('input', applyLaunchFiltersToMain);
    byId('clearLaunchFilters').addEventListener('click', () => {
      resetDashboardFilters();
      syncLaunchFiltersFromMain();
      render();
    });
    document.querySelectorAll('.sortable-th').forEach((button) => {
      button.addEventListener('click', () => setSortFromHeader(button.dataset.sortField || 'date'));
    });
	    byId('dateBasisSwitch').addEventListener('change', setDateBasisFromSwitch);
	    byId('launchDateBasisSwitch').addEventListener('change', setDateBasisFromLaunchSwitch);
    byId('showCardDueView').addEventListener('click', () => applyCardStatementView('due'));
    byId('showCardPurchaseView').addEventListener('click', () => applyCardStatementView('purchase'));
    byId('statementAccount').addEventListener('change', () => {
      byId('statementDue').value = defaultStatementDue(accountBySelectValue(byId('statementAccount').value));
      syncStatementCycleFields(true);
    });
    byId('statementDue').addEventListener('change', () => syncStatementCycleFields(true));
    byId('statementAmount').addEventListener('blur', (event) => {
      event.target.value = brMoneyInput(event.target.value);
    });
    byId('prepareStatementClose').addEventListener('click', prepareStatementClose);
    ['newUser', 'newDefaultAccount', 'newDefaultCategory'].forEach((id) => byId(id).addEventListener('change', () => {
      if (id === 'newUser') {
        renderNewRows();
        render();
      }
    }));
    byId('openInsertDialog').addEventListener('click', () => {
      if (!newRows.length) newRows.push(newRowTemplate());
      renderNewRows();
      byId('insertDialog').showModal();
    });
    byId('closeInsertDialog').addEventListener('click', () => byId('insertDialog').close());
    byId('addNewRow').addEventListener('click', () => addNewRow());
    byId('loadNewPaste').addEventListener('click', () => {
      const parsed = parsePastedRows();
      if (!parsed.length) {
        byId('newStatus').innerHTML = '<span class="warn">Nenhuma linha reconhecida.</span>';
        return;
      }
      newRows.push(...parsed);
      byId('newStatus').textContent = `${parsed.length} linha${parsed.length === 1 ? '' : 's'} carregada${parsed.length === 1 ? '' : 's'}.`;
      renderNewRows();
      render();
    });
    byId('newRows').addEventListener('input', (event) => {
      if (event.target?.classList?.contains('new-field')) queueNewField(event.target);
    });
    byId('newRows').addEventListener('change', (event) => {
      if (event.target?.classList?.contains('new-field')) queueNewField(event.target, true);
    });
    byId('newRows').addEventListener('click', (event) => {
      if (event.target?.classList?.contains('remove-new-row')) removeNewRow(Number(event.target.dataset.index));
    });
    byId('rows').addEventListener('input', (event) => {
      if (event.target?.classList?.contains('edit-field')) queueChange(event.target);
    });
    byId('rows').addEventListener('change', (event) => {
      if (event.target?.classList?.contains('edit-field')) queueChange(event.target, true);
    });
    byId('txCards').addEventListener('input', (event) => {
      if (event.target?.classList?.contains('edit-field')) queueChange(event.target);
    });
    byId('txCards').addEventListener('change', (event) => {
      if (event.target?.classList?.contains('edit-field')) queueChange(event.target, true);
    });
    byId('monthlyRows').addEventListener('click', (event) => {
      const groupRow = event.target?.closest?.('[data-monthly-group]');
      if (groupRow) {
        const group = groupRow.dataset.monthlyGroup || '';
        if (expandedGroups.has(group)) expandedGroups.delete(group);
        else expandedGroups.add(group);
        renderMonthlySummary();
        return;
      }
      const categoryRow = event.target?.closest?.('[data-monthly-category]');
      if (categoryRow) {
        const months = dashboardMonths();
        byId('start').value = monthStart(months[0].key);
        byId('end').value = monthEnd(months[months.length - 1].key);
        byId('groupFilter').value = categoryRow.dataset.monthlyGroupName || '';
        refreshFilterOptions();
        byId('categoryFilter').value = String(categoryRow.dataset.monthlyCategory || '');
        drilldownActive = true;
        setActiveSection('launches');
        render();
      }
    });
    byId('generateBatch').addEventListener('click', () => prepareOperation('edit'));
    byId('generateInsert').addEventListener('click', () => prepareOperation('insert'));
    byId('closeDialog').addEventListener('click', () => byId('editDialog').close());
    byId('confirmCommand').addEventListener('click', confirmPreparedOperation);
    render();
  </script>
</body>
</html>"""
        .replace("__TITLE__", title)
        .replace("__DASHBOARD_DATA__", data_json)
    )


def batch_entry_dataset(catalog: Catalog) -> dict[str, Any]:
    return {
        "title": "Inclusão em lote familiar",
        "generatedAt": datetime.now(ZoneInfo(BUSINESS_TIMEZONE)).strftime("%Y-%m-%d %H:%M"),
        "categories": [
            {
                "id": category.get("id"),
                "label": category_label(category, catalog),
                "tipo": category.get("tipo_padrao") or "variavel",
            }
            for category in sorted(catalog.categorias, key=lambda item: category_label(item, catalog))
        ],
        "accounts": [
            {"id": account.get("id"), "nome": account.get("nome") or ""}
            for account in sorted(catalog.contas, key=lambda item: str(item.get("nome") or ""))
        ],
        "users": [
            {"id": user.get("id"), "nome": user.get("nome") or ""}
            for user in sorted(catalog.usuarios, key=lambda item: str(item.get("nome") or ""))
        ],
    }


def batch_entry_html(dataset: dict[str, Any]) -> str:
    data_json = json.dumps(dataset, ensure_ascii=False).replace("</", "<\\/")
    title = html_lib.escape(str(dataset.get("title") or "Inclusão em lote familiar"))
    return (
        """<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>__TITLE__</title>
  <style>
    :root { --bg: #f6f8fb; --panel: #fff; --ink: #172033; --muted: #657084; --line: #dce3ec; --accent: #0d7a6f; --warn: #fff7d6; --bad: #b42318; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); }
    header { padding: 20px clamp(14px, 4vw, 40px) 12px; background: var(--panel); border-bottom: 1px solid var(--line); }
    h1 { margin: 0 0 6px; font-size: clamp(24px, 3vw, 32px); letter-spacing: 0; }
    main { padding: 18px clamp(10px, 4vw, 40px) 34px; display: grid; gap: 14px; }
    .muted { color: var(--muted); }
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    .paste { display: grid; gap: 10px; padding: 14px; }
    textarea, input, select, button { font: inherit; border: 1px solid var(--line); border-radius: 8px; padding: 9px 10px; background: #fff; color: var(--ink); min-height: 40px; }
    textarea:focus, input:focus, select:focus, button:focus { outline: 2px solid rgba(13, 122, 111, .28); outline-offset: 2px; border-color: var(--accent); }
    textarea { width: 100%; min-height: 120px; resize: vertical; }
    button { cursor: pointer; font-weight: 650; }
    .primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    .primary[disabled] { opacity: .5; cursor: not-allowed; }
    .toolbar { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; padding: 12px 14px; border-bottom: 1px solid var(--line); }
    .toolbar-left { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 9px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 650; background: #fbfcfe; }
    tr.incomplete { background: var(--warn); }
    .field { width: 100%; min-width: 110px; border-radius: 6px; min-height: 36px; padding: 7px 8px; }
    .desc { min-width: 220px; }
    .value { min-width: 100px; text-align: right; }
    .remove { min-width: 38px; padding: 7px 9px; }
    dialog { border: 1px solid var(--line); border-radius: 8px; max-width: 760px; width: calc(100vw - 32px); padding: 0; }
    dialog::backdrop { background: rgba(15, 23, 42, .42); }
    .modal { padding: 18px; display: grid; gap: 12px; }
    .modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .modal-head h2 { margin: 0; font-size: 19px; }
    #telegramMessage { min-height: 260px; }
    .status.bad { color: var(--bad); font-weight: 650; }
    @media (max-width: 860px) {
      main { padding: 12px 10px 28px; }
      .table-scroll { overflow-x: auto; }
      table { min-width: 1020px; }
      .toolbar { align-items: flex-start; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Inclusão em lote familiar</h1>
    <div class="muted">Cole dados do Excel ou preencha linha a linha · gerado em <span id="generatedAt"></span></div>
  </header>
  <main>
    <section class="panel paste">
      <label>Colar do Excel <textarea id="pasteBox" placeholder="Data	Descrição	Valor Total	Parcelas&#10;06/05/2026	Supermercado	123,45	1"></textarea></label>
      <div class="actions">
        <button class="primary" id="loadPaste">Carregar dados</button>
        <span class="muted">Colunas aceitas: data, descrição, valor total e parcelas.</span>
      </div>
    </section>
    <section class="panel">
      <div class="toolbar">
        <div class="toolbar-left">
          <button id="addRow">Adicionar linha</button>
          <strong id="rowCount">0 lançamentos</strong>
          <span class="muted" id="readyCount"></span>
        </div>
        <div class="actions">
          <span id="status" class="muted"></span>
          <button class="primary" id="generateMessage" disabled>Copiar lote para Telegram</button>
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr><th>Data</th><th>Descrição</th><th>Valor Total</th><th>Parcelas</th><th>Categoria</th><th>Conta</th><th>Usuário</th><th></th></tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </section>
  </main>
  <dialog id="messageDialog">
    <div class="modal">
      <div class="modal-head">
        <h2>Lote para Telegram</h2>
        <button id="closeDialog">Fechar</button>
      </div>
      <p class="muted">Cole esta mensagem no Telegram. O Alfred vai conferir e pedir uma confirmação única antes de gravar.</p>
      <textarea id="telegramMessage" readonly></textarea>
      <div class="actions">
        <span id="copyStatus" class="muted"></span>
        <button class="primary" id="copyMessage">Copiar mensagem</button>
      </div>
    </div>
  </dialog>
  <script>
    const BATCH = __BATCH_DATA__;
    const rows = [];
    const byId = (id) => document.getElementById(id);
    const defaultUserId = String(BATCH.users[0]?.id || '');
    const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function parseMoney(value) {
      const text = String(value || '').replace(/R\\$\\s*/i, '').replace(/\\s/g, '');
      if (!text) return NaN;
      const normalized = text.includes(',') ? text.replace(/\\./g, '').replace(',', '.') : text;
      return Number(normalized);
    }

    function moneyInput(value) {
      const parsed = parseMoney(value);
      return Number.isFinite(parsed) ? fmt.format(parsed) : '';
    }

    function optionList(items, valueKey, labelKey, selected) {
      return items.map((item) => {
        const value = String(item[valueKey] ?? '');
        const label = String(item[labelKey] ?? '');
        return `<option value="${escapeHtml(value)}"${value === String(selected ?? '') ? ' selected' : ''}>${escapeHtml(label)}</option>`;
      }).join('');
    }

    function blankRow(seed = {}) {
      return {
        data: seed.data || '',
        descricao: seed.descricao || '',
        valor: seed.valor ? moneyInput(seed.valor) : '',
        parcelas: seed.parcelas || '1',
        categoria_id: seed.categoria_id || '',
        conta_id: seed.conta_id || '',
        usuario_lancamento_id: seed.usuario_lancamento_id || defaultUserId,
      };
    }

    function parseDateCell(value) {
      const raw = String(value || '').trim();
      if (/^\\d{4}-\\d{2}-\\d{2}$/.test(raw)) return raw;
      const match = raw.match(/^(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?$/);
      if (!match) return raw;
      const year = match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : String(new Date().getFullYear());
      return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    }

    function parsePaste() {
      const text = byId('pasteBox').value.trim();
      if (!text) return;
      const parsed = text.split(/\\r?\\n/).map((line) => (
        line.includes('\\t') ? line.split('\\t') : line.includes(';') ? line.split(';') : line.split(',')
      ));
      const first = parsed[0]?.map((item) => item.trim().toLowerCase()) || [];
      const hasHeader = first.some((item) => item.includes('data') || item.includes('descr') || item.includes('valor'));
      const body = hasHeader ? parsed.slice(1) : parsed;
      for (const cols of body) {
        if (cols.length < 3) continue;
        rows.push(blankRow({
          data: parseDateCell(cols[0]),
          descricao: cols[1]?.trim() || '',
          valor: cols[2]?.trim() || '',
          parcelas: /^\\d+$/.test(String(cols[3] || '').trim()) ? String(cols[3]).trim() : '1'
        }));
      }
      render();
    }

    function complete(row) {
      const installments = Number(row.parcelas || '1');
      return row.data && row.descricao && Number.isFinite(parseMoney(row.valor)) && parseMoney(row.valor) > 0 && Number.isInteger(installments) && installments >= 1 && installments <= 48 && row.categoria_id && row.conta_id && row.usuario_lancamento_id;
    }

    function render() {
      byId('rows').innerHTML = rows.map((row, index) => `
        <tr class="${complete(row) ? '' : 'incomplete'}" data-index="${index}">
          <td><input class="field" data-field="data" type="date" value="${escapeHtml(row.data)}"></td>
          <td><input class="field desc" data-field="descricao" value="${escapeHtml(row.descricao)}"></td>
          <td><input class="field value" data-field="valor" inputmode="decimal" value="${escapeHtml(row.valor)}"></td>
          <td><input class="field value" data-field="parcelas" inputmode="numeric" value="${escapeHtml(row.parcelas)}"></td>
          <td><select class="field" data-field="categoria_id"><option value="">Categoria</option>${optionList(BATCH.categories, 'id', 'label', row.categoria_id)}</select></td>
          <td><select class="field" data-field="conta_id"><option value="">Conta</option>${optionList(BATCH.accounts, 'id', 'nome', row.conta_id)}</select></td>
          <td><select class="field" data-field="usuario_lancamento_id">${optionList(BATCH.users, 'id', 'nome', row.usuario_lancamento_id)}</select></td>
          <td><button class="remove" data-remove="${index}">×</button></td>
        </tr>
      `).join('');
      updateSummary();
    }

    function updateSummary() {
      document.querySelectorAll('#rows tr').forEach((tr) => {
        const row = rows[Number(tr.dataset.index)];
        tr.classList.toggle('incomplete', !complete(row));
      });
      const ready = rows.filter(complete).length;
      byId('rowCount').textContent = `${rows.length} lançamento${rows.length === 1 ? '' : 's'}`;
      byId('readyCount').textContent = rows.length ? ` · ${ready} completo${ready === 1 ? '' : 's'}` : '';
      byId('generateMessage').disabled = !rows.length || ready !== rows.length;
      byId('status').textContent = rows.length && ready !== rows.length ? 'Complete todas as linhas.' : '';
      byId('status').className = rows.length && ready !== rows.length ? 'status bad' : 'muted';
    }

    function payload() {
      return rows.map((row) => {
        const category = BATCH.categories.find((item) => String(item.id) === String(row.categoria_id));
        return {
          data: row.data,
          descricao: row.descricao,
          valor: row.valor,
          categoria_id: Number(row.categoria_id),
          conta_id: Number(row.conta_id),
          usuario_lancamento_id: Number(row.usuario_lancamento_id),
          parcelas: Number(row.parcelas || '1'),
          tipo: category?.tipo || 'variavel',
        };
      });
    }

    function buildMessage() {
      return [
        `Incluir ${rows.length} lançamento(s) familiar(es) em lote. Quero uma única confirmação antes de gravar.`,
        '',
        'PEDIDO_INCLUSAO_LOTE_FAMILIAR',
        '```json',
        JSON.stringify({ action: 'incluir_lancamentos_familiares', entries: payload() }, null, 2),
        '```'
      ].join('\\n');
    }

    byId('generatedAt').textContent = BATCH.generatedAt;
    byId('loadPaste').addEventListener('click', parsePaste);
    byId('addRow').addEventListener('click', () => { rows.push(blankRow()); render(); });
    byId('rows').addEventListener('input', (event) => {
      const tr = event.target.closest('tr');
      const index = Number(tr?.dataset.index);
      const field = event.target.dataset.field;
      if (!Number.isInteger(index) || !field) return;
      rows[index][field] = event.target.value;
      updateSummary();
    });
    byId('rows').addEventListener('change', (event) => {
      const tr = event.target.closest('tr');
      const index = Number(tr?.dataset.index);
      const field = event.target.dataset.field;
      if (!Number.isInteger(index) || !field) return;
      rows[index][field] = field === 'valor' ? moneyInput(event.target.value) : event.target.value;
      if (field === 'valor') event.target.value = rows[index][field];
      updateSummary();
    });
    byId('rows').addEventListener('click', (event) => {
      const remove = event.target.dataset.remove;
      if (remove === undefined) return;
      rows.splice(Number(remove), 1);
      render();
    });
    byId('generateMessage').addEventListener('click', () => {
      byId('telegramMessage').value = buildMessage();
      byId('copyStatus').textContent = '';
      byId('messageDialog').showModal();
    });
    byId('closeDialog').addEventListener('click', () => byId('messageDialog').close());
    byId('copyMessage').addEventListener('click', async () => {
      await navigator.clipboard.writeText(byId('telegramMessage').value);
      byId('copyStatus').textContent = 'Mensagem copiada.';
    });
    rows.push(blankRow());
    render();
  </script>
</body>
</html>"""
        .replace("__TITLE__", title)
        .replace("__BATCH_DATA__", data_json)
    )


def publish_dashboard_file(filename: str, *, telegram_chat_id: str = "", meta: dict[str, Any] | None = None) -> str:
    headers = {"Content-Type": "application/json"}
    secret = os.environ.get("PUBLISH_SECRET")
    if secret:
        headers["x-publish-secret"] = secret
    full_path = PUBLISHED_DIR / filename
    token_meta = {"telegram_chat_id": normalize_telegram_target(telegram_chat_id)}
    if meta:
        token_meta.update(meta)
    payload: dict[str, Any] = {
        "filename": filename,
        "ttl": DASHBOARD_TTL_SECONDS,
        "meta": token_meta,
    }
    publish_target = urlparse(PUBLISHER_URL)
    local_publish_hosts = {"", "127.0.0.1", "localhost", "::1"}
    if publish_target.hostname not in local_publish_hosts:
        payload["content"] = full_path.read_text(encoding="utf-8")
    response = requests.post(
        PUBLISHER_URL,
        headers=headers,
        json=payload,
        timeout=10,
    )
    if not response.ok:
        raise RuntimeError(f"Falha ao publicar dashboard: {response.status_code} {response.text[:200]}")
    url = str(response.json().get("url") or "")
    if not url:
        raise RuntimeError("Publicador não retornou URL do dashboard.")
    if url.startswith("/"):
        public_base = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
        parsed = urlparse(PUBLISHER_URL)
        base = public_base or f"{parsed.scheme or 'http'}://{parsed.netloc or '127.0.0.1:8099'}"
        url = f"{base}{url}"
    return url


def create_dashboard_link(db: Supabase, catalog: Catalog, start: date, end: date, label: str, telegram_chat_id: str = "") -> str:
    dataset = dashboard_dataset(db, catalog, start, end, label, telegram_chat_id)
    filename = f"financeiro_familiar_dashboard_{start.isoformat()}_{uuid.uuid4().hex[:12]}.html"
    PUBLISHED_DIR.mkdir(parents=True, exist_ok=True)
    (PUBLISHED_DIR / filename).write_text(dashboard_html(dataset), encoding="utf-8")
    return publish_dashboard_file(
        filename,
        telegram_chat_id=telegram_chat_id,
        meta={"dashboard_start": start.isoformat(), "dashboard_end": end.isoformat(), "dashboard_label": label},
    )


def create_batch_entry_link(catalog: Catalog) -> str:
    filename = f"financeiro_familiar_lote_{business_today().isoformat()}_{uuid.uuid4().hex[:12]}.html"
    PUBLISHED_DIR.mkdir(parents=True, exist_ok=True)
    (PUBLISHED_DIR / filename).write_text(batch_entry_html(batch_entry_dataset(catalog)), encoding="utf-8")
    return publish_dashboard_file(filename)


def telegram_bar(value: Decimal, total: Decimal, width: int = 10) -> str:
    if total <= 0:
        return "░" * width
    ratio = max(Decimal("0.00"), min(Decimal("1.00"), value / total))
    filled = int((ratio * width).to_integral_value(rounding=ROUND_HALF_UP))
    filled = max(1 if value > 0 else 0, min(width, filled))
    return "█" * filled + "░" * (width - filled)


def percentage_label(value: Decimal, total: Decimal) -> str:
    if total <= 0:
        return "0%"
    pct = (value / total * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return f"{pct}%"


def report_category_lines(categories_total: dict[str, Decimal], max_items: int = 4) -> list[str]:
    ordered = sorted(categories_total.items(), key=lambda item: (-item[1], item[0]))
    shown = ordered[:max_items]
    lines = [f"   - {name}: {brl(value)}" for name, value in shown]
    remaining = ordered[max_items:]
    if remaining:
        remaining_total = sum((value for _, value in remaining), Decimal("0.00"))
        label = "Outra categoria" if len(remaining) == 1 else f"Outras {len(remaining)} categorias"
        lines.append(f"   - {label}: {brl(remaining_total)}")
    return lines


def report_for_period(db: Supabase, catalog: Catalog, text: str, telegram_chat_id: str = "") -> dict[str, Any]:
    start, end, label = parse_report_period(text)
    rows = query_lancamentos_for_period(db, start, end)
    categories = category_by_id(catalog)
    grouped: dict[str, dict[str, Decimal]] = {}
    total_receitas = Decimal("0.00")
    total_despesas = Decimal("0.00")
    total_recuperar = Decimal("0.00")
    for row in rows:
        category = categories.get(int(row.get("categoria_id") or 0))
        if not category:
            group = "Sem categoria"
            category_name = "Sem categoria"
        else:
            group = group_name(catalog, category.get("grupo_id")) or "Sem grupo"
            category_name = str(category.get("nome") or "Sem categoria")
        value = money_to_decimal(row.get("valor")) or Decimal("0.00")
        grouped.setdefault(group, {})
        grouped[group][category_name] = grouped[group].get(category_name, Decimal("0.00")) + value
        if group == "Receitas":
            total_receitas += value
        elif group == "A recuperar":
            total_recuperar += value
        else:
            total_despesas += value

    group_totals = {
        group: sum(categories_total.values(), Decimal("0.00"))
        for group, categories_total in grouped.items()
    }
    operating_groups = sorted(
        [(group, value) for group, value in group_totals.items() if group not in {"Receitas", "A recuperar"}],
        key=lambda item: (-item[1], item[0]),
    )
    cash_flow = total_receitas - total_despesas - total_recuperar
    result_without_recoverable = total_receitas - total_despesas

    lines = [
        f"📊 Financeiro familiar · {label}",
        f"{start.strftime('%d/%m')} a {end.strftime('%d/%m')} · {len(rows)} lançamento{'s' if len(rows) != 1 else ''}",
    ]
    if not rows:
        lines.append("Nenhum lançamento ativo encontrado no período.")
    else:
        lines.extend(
            [
                "",
                f"💸 Despesas: {brl(total_despesas)}",
                f"💰 Receitas: {brl(total_receitas)}",
                f"↩️ A recuperar: {brl(total_recuperar)}",
                f"🧮 Resultado: {brl(result_without_recoverable)}",
                f"🏦 Fluxo do mês: {brl(cash_flow)}",
            ]
        )
        if operating_groups:
            lines.extend(["", "Maiores despesas"])
            for index, (group, value) in enumerate(operating_groups[:3], start=1):
                lines.append(f"{index}. {group}: {brl(value)} · {percentage_label(value, total_despesas)}")
            remaining_groups = operating_groups[3:]
            if remaining_groups:
                remaining_total = sum((value for _, value in remaining_groups), Decimal("0.00"))
                lines.append(f"+ {len(remaining_groups)} grupos: {brl(remaining_total)}")
    dashboard_url = ""
    dashboard_error = ""
    try:
        dashboard_url = create_dashboard_link(db, catalog, start, end, label, telegram_chat_id)
        lines.extend(["", "🔎 Detalhe completo e gráficos:", dashboard_url, "Link válido por 60 minutos."])
    except Exception as exc:  # noqa: BLE001
        dashboard_error = str(exc)
        lines.extend(["", "Não consegui gerar o link do dashboard agora."])
    return {
        "action": "report",
        "message": "\n".join(lines).strip(),
        "period": {"start": start.isoformat(), "end": end.isoformat(), "label": label},
        "count": len(rows),
        "dashboard_url": dashboard_url,
        "dashboard_error": dashboard_error,
    }


def parse_draft_json(value: str) -> dict[str, Any]:
    if not value:
        return {}
    data = json.loads(value)
    if isinstance(data, dict) and isinstance(data.get("draft"), dict):
        return data["draft"]
    if isinstance(data, dict) and isinstance(data.get("details"), dict) and isinstance(data["details"].get("draft"), dict):
        return data["details"]["draft"]
    if isinstance(data, dict):
        return data
    return {}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--message", default="")
    parser.add_argument("--intent-json", default="", help="Intent estruturada vinda da IA, com allowlist rígida.")
    parser.add_argument("--draft-json", default="")
    parser.add_argument("--commit", action="store_true")
    parser.add_argument("--report", action="store_true")
    parser.add_argument("--dashboard-data", action="store_true")
    parser.add_argument("--dashboard-start", default="")
    parser.add_argument("--dashboard-end", default="")
    parser.add_argument("--dashboard-label", default="")
    parser.add_argument("--prepare-statement-json", default="")
    parser.add_argument("--card-configs", action="store_true")
    parser.add_argument("--save-card-config-json", default="")
    parser.add_argument("--accounts-admin", action="store_true")
    parser.add_argument("--save-account-json", default="")
    parser.add_argument("--categories-admin", action="store_true")
    parser.add_argument("--save-category-json", default="")
    parser.add_argument("--offline-catalog", action="store_true", help="Usa catalogo inicial local para testes sem Supabase.")
    parser.add_argument("--telegram-chat-id", default="", help="Chat/group id usado para validar allowlist do grupo familiar.")
    parser.add_argument("--audit-origin", default="", help="Origem operacional para auditoria de commits validados.")
    parser.add_argument("--audit-session", default="", help="Sessao/token opaco para auditoria de commits validados.")
    parser.add_argument("--audit-requested-by", default="", help="Usuario/canal solicitante para auditoria de commits validados.")
    args = parser.parse_args()

    try:
        if args.offline_catalog:
            os.environ.setdefault("FINANCEIRO_FAMILIAR_REFERENCE_DATE", OFFLINE_REFERENCE_DATE)
        load_runtime_env()
        ensure_allowed_chat(args.telegram_chat_id, require_chat=args.commit or args.report)
        if args.commit:
            draft = parse_draft_json(args.draft_json)
            db = Supabase()
            audit = {
                "origin": args.audit_origin,
                "session": args.audit_session,
                "requested_by": args.audit_requested_by,
            }
            if draft.get("waiting_for") == "edit_confirmation":
                result = commit_edit_draft(db, draft, audit)
            elif draft.get("waiting_for") == "batch_confirmation":
                result = commit_batch_insert_draft(db, draft, audit)
            elif draft.get("waiting_for") == "fatura_confirmation":
                result = commit_statement_close_draft(db, draft, audit)
            else:
                result = commit_draft(db, draft, audit)
            print(json.dumps(result, ensure_ascii=False))
            return 0
        db = None if args.offline_catalog else Supabase()
        catalog = load_catalog(db, offline=args.offline_catalog)
        if args.card_configs:
            if args.offline_catalog or db is None:
                raise RuntimeError("Parâmetros de cartão precisam consultar o Supabase.")
            print(json.dumps({"action": "card_configs", **list_card_configs(db, catalog)}, ensure_ascii=False))
            return 0
        if args.save_card_config_json:
            if args.offline_catalog or db is None:
                raise RuntimeError("Parâmetros de cartão precisam consultar o Supabase.")
            payload = json.loads(args.save_card_config_json)
            if not isinstance(payload, dict):
                raise RuntimeError("Payload de parâmetros do cartão precisa ser objeto JSON.")
            print(json.dumps(save_card_config(db, catalog, payload), ensure_ascii=False))
            return 0
        if args.accounts_admin:
            if args.offline_catalog or db is None:
                raise RuntimeError("Contas precisam consultar o Supabase.")
            print(json.dumps(list_accounts_admin(db, catalog), ensure_ascii=False))
            return 0
        if args.save_account_json:
            if args.offline_catalog or db is None:
                raise RuntimeError("Contas precisam consultar o Supabase.")
            payload = json.loads(args.save_account_json)
            if not isinstance(payload, dict):
                raise RuntimeError("Payload de conta precisa ser objeto JSON.")
            print(json.dumps(save_account_admin(db, catalog, payload), ensure_ascii=False))
            return 0
        if args.categories_admin:
            if args.offline_catalog or db is None:
                raise RuntimeError("Categorias precisam consultar o Supabase.")
            print(json.dumps(list_categories_admin(db, catalog), ensure_ascii=False))
            return 0
        if args.save_category_json:
            if args.offline_catalog or db is None:
                raise RuntimeError("Categorias precisam consultar o Supabase.")
            payload = json.loads(args.save_category_json)
            if not isinstance(payload, dict):
                raise RuntimeError("Payload de categoria precisa ser objeto JSON.")
            print(json.dumps(save_category_admin(db, catalog, payload), ensure_ascii=False))
            return 0
        if args.dashboard_data:
            if args.offline_catalog or db is None:
                raise RuntimeError("Dashboard precisa consultar o Supabase.")
            start = date.fromisoformat(args.dashboard_start)
            end = date.fromisoformat(args.dashboard_end)
            label = args.dashboard_label or start.strftime("%m/%Y")
            print(json.dumps(dashboard_dataset(db, catalog, start, end, label, args.telegram_chat_id), ensure_ascii=False))
            return 0
        if args.prepare_statement_json:
            if args.offline_catalog or db is None:
                raise RuntimeError("Fechamento de fatura precisa consultar o Supabase.")
            payload = json.loads(args.prepare_statement_json)
            if not isinstance(payload, dict):
                raise RuntimeError("Payload de fatura precisa ser objeto JSON.")
            draft = prepare_dashboard_statement_close_draft(payload, db, catalog)
            print(json.dumps(response_for_draft(draft, catalog, db, args.telegram_chat_id), ensure_ascii=False))
            return 0
        if args.report:
            if args.offline_catalog or db is None:
                raise RuntimeError("Relatório precisa consultar o Supabase.")
            print(json.dumps(report_for_period(db, catalog, args.message, args.telegram_chat_id), ensure_ascii=False))
            return 0
        draft = parse_draft_json(args.draft_json)
        message = intent_to_message(args.intent_json) if args.intent_json else args.message
        if db is not None:
            statement_check = prepare_statement_check_report(message, db, catalog)
            if statement_check:
                print(json.dumps(statement_check, ensure_ascii=False))
                return 0
        if db is None and parse_credit_card_statement_sms(message):
            raise RuntimeError("Fechamento de fatura precisa consultar o Supabase para listar os lançamentos do cartão.")
        if db is not None:
            statement_draft = prepare_statement_close_draft(message, db, catalog)
            if statement_draft:
                print(json.dumps(response_for_draft(statement_draft, catalog, db, args.telegram_chat_id), ensure_ascii=False))
                return 0
        draft = update_draft(message, draft, catalog)
        print(json.dumps(response_for_draft(draft, catalog, db, args.telegram_chat_id), ensure_ascii=False))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"action": "error", "message": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
