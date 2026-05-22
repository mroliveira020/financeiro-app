from __future__ import annotations

import csv
import json
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from datetime import timedelta

import requests

from config import ensure_dir, get_supabase_settings, resolve_path


def _clean_numero_bem(value: Any) -> Optional[str]:
    if value is None:
        return None
    cleaned = re.sub(r"\D", "", str(value))
    return cleaned or None


def _normalize_bool(value: Any) -> Optional[bool]:
    if value is None:
        return None
    text = str(value).strip().lower()
    text = text.replace("não", "nao")
    truthy = {"sim", "s", "true", "1", "yes"}
    falsy = {"nao", "n", "false", "0", "nao disponivel", "não disponivel"}
    if text in truthy:
        return True
    if text in falsy:
        return False
    return None


def _normalize_decimal(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value)
    text = text.replace("R$", "").replace(".", "").replace(" ", "")
    text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _parse_datetime(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    text = str(value).strip()
    if not text:
        return None

    patterns = [
        "%d/%m/%Y - %Hh%M",
        "%d/%m/%Y - %H:%M",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y",
    ]
    for fmt in patterns:
        try:
            parsed = datetime.strptime(text, fmt)
            return parsed.isoformat()
        except ValueError:
            continue
    return None


def _first_non_empty(*values: Any) -> Optional[Any]:
    for value in values:
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return None


def _normalize_string_list(value: Any) -> Optional[list[str]]:
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        return [text] if text else None
    if isinstance(value, (list, tuple, set)):
        itens = [str(item).strip() for item in value if str(item).strip()]
        return itens or None
    return None


def build_prospeccao_record(row: Dict[str, Any], fonte: str) -> Optional[Dict[str, Any]]:
    numero_bem = _clean_numero_bem(row.get("Número do Bem") or row.get("Numero do Bem"))
    if not numero_bem:
        return None

    record: Dict[str, Any] = {
        "numero_bem": numero_bem,
        "coletado_em": _parse_datetime(
            row.get("Data/Hora da Busca") or row.get("coletado_em") or datetime.utcnow()
        ),
        "tipo_venda": _first_non_empty(row.get("Tipo de Venda")),
        "tipo_imovel": _first_non_empty(row.get("Tipo de Imóvel"), row.get("Tipo de imóvel")),
        "uf": _first_non_empty(row.get("UF")),
        "cidade": _first_non_empty(row.get("Cidade")),
        "bairro": _first_non_empty(row.get("Bairro")),
        "endereco": _first_non_empty(row.get("Endereço")),
        "valor_avaliacao": _normalize_decimal(row.get("Valor de Avaliação")),
        "valor_venda": _normalize_decimal(row.get("Valor de Venda")),
        "desconto": _normalize_decimal(row.get("Desconto")),
        "detalhes": _first_non_empty(row.get("Detalhes")),
        "disponivel": _normalize_bool(row.get("Disponível")),
        "financia": _normalize_bool(row.get("Financia")),
        "valor_leilao_1": _normalize_decimal(row.get("Valor Leilao 1")),
        "valor_leilao_2": _normalize_decimal(row.get("Valor Leilao 2")),
        "data_leilao_1": _parse_datetime(row.get("Data Leilao 1")),
        "data_leilao_2": _parse_datetime(row.get("Data Leilao 2")),
        "data_licitacao_aberta": _parse_datetime(row.get("Data Licitação Aberta")),
        "data_hora_encerramento": _parse_datetime(row.get("Data/hora Encerramento")),
        "lance_atual": _normalize_decimal(row.get("Lance Atual")),
        "link_consulta": _first_non_empty(row.get("Link de Consulta")),
        "foto_url": _first_non_empty(row.get("Foto URL"), row.get("foto_url")),
        "fotos": _normalize_string_list(_first_non_empty(row.get("Fotos"), row.get("fotos"))),
        "fonte": fonte,
        "hash_linha": row.get("hash_linha"),
    }
    return record


class SupabaseClient:
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.enabled = bool(config.get("enabled"))
        self.url = (config.get("url") or "").rstrip("/")
        self.anon_key = config.get("anon_key") or ""
        self.service_key = config.get("service_role_key") or ""
        self.chunk_size = int(config.get("chunk_size") or 0)
        self.timeout = int(config.get("timeout") or 10)
        retry_cfg = config.get("retry") or {}
        self.retry_attempts = int(retry_cfg.get("attempts", 1))
        self.backoff_seconds = int(retry_cfg.get("backoff_seconds", 1))
        self.error_log_path = resolve_path(config.get("error_log", "data/output/erros_supabase.csv"))
        self.session = requests.Session()

    def is_configured(self) -> bool:
        return bool(self.enabled and self.url and self.service_key)

    def _headers(self) -> Dict[str, str]:
        return {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        }

    def _log_error(self, table: str, status: str, message: str, payload: Any) -> None:
        ensure_dir(self.error_log_path.parent)
        is_new_file = not self.error_log_path.exists()
        with self.error_log_path.open("a", newline="", encoding="utf-8") as fh:
            writer = csv.writer(fh)
            if is_new_file:
                writer.writerow(["timestamp", "table", "status", "message", "payload"])
            payload_str = json.dumps(payload, ensure_ascii=False)
            writer.writerow([datetime.utcnow().isoformat(), table, status, message, payload_str])

    def _send_batch(self, table: str, records: List[Dict[str, Any]], on_conflict: str) -> bool:
        endpoint = f"{self.url}/rest/v1/{table}"
        params = {"on_conflict": on_conflict}

        for attempt in range(1, self.retry_attempts + 1):
            try:
                response = self.session.post(
                    endpoint,
                    headers=self._headers(),
                    params=params,
                    json=records,
                    timeout=self.timeout,
                )
                if response.ok:
                    return True
                error_msg = f"{response.status_code} {response.text}"
            except requests.RequestException as exc:  # noqa: BLE001
                error_msg = str(exc)

            if attempt < self.retry_attempts:
                time.sleep(self.backoff_seconds)
        self._log_error(table, "failed", error_msg, records)
        print(f"[Supabase] Falha ao enviar lote ({len(records)} registros): {error_msg}")
        return False

    def upsert(self, table: str, records: List[Dict[str, Any]], on_conflict: str) -> None:
        if not self.is_configured():
            print("[Supabase] Integração desabilitada ou incompleta. Pulei o envio.")
            return

        if not records:
            print("[Supabase] Nenhum registro para enviar.")
            return

        if self.chunk_size and self.chunk_size > 0:
            chunks: Iterable[List[Dict[str, Any]]] = (
                records[i : i + self.chunk_size] for i in range(0, len(records), self.chunk_size)
            )
        else:
            chunks = [records]

        sent = 0
        for chunk in chunks:
            if self._send_batch(table, chunk, on_conflict):
                sent += len(chunk)
        print(f"[Supabase] Envio concluído: {sent}/{len(records)} registros.")

    def upsert_prospeccao(self, rows: Iterable[Dict[str, Any]], fonte: str) -> None:
        records: List[Dict[str, Any]] = []
        for row in rows:
            record = build_prospeccao_record(row, fonte=fonte)
            if record:
                records.append(record)
        self.upsert("imoveis_prospeccao", records, on_conflict="numero_bem,coletado_em")

    def fetch_recent_numeros(self, hours_back: int) -> set[str]:
        if not self.is_configured():
            print("[Supabase] Integração desabilitada ou incompleta. Não foi possível ler registros existentes.")
            return set()
        if hours_back <= 0:
            return set()

        since = datetime.utcnow() - timedelta(hours=hours_back)
        since_iso = since.isoformat()
        endpoint = f"{self.url}/rest/v1/imoveis_prospeccao"
        params = {
            "select": "numero_bem,coletado_em",
            "coletado_em": f"gte.{since_iso}",
            "order": "coletado_em.desc",
        }
        try:
            response = self.session.get(
                endpoint,
                headers=self._headers(),
                params=params,
                timeout=self.timeout,
            )
            if not response.ok:
                print(f"[Supabase] Não foi possível ler registros recentes ({response.status_code}): {response.text}")
                return set()
            data = response.json()
            return {item.get("numero_bem") for item in data if item.get("numero_bem")}
        except requests.RequestException as exc:  # noqa: BLE001
            print(f"[Supabase] Erro ao buscar registros recentes: {exc}")
            return set()


def init_supabase_client(config: Dict[str, Any]) -> SupabaseClient:
    supabase_settings = get_supabase_settings(config)
    return SupabaseClient(supabase_settings)
