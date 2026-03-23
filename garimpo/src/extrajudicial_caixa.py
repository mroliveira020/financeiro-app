"""Coleta dados de imóveis em venda direta na CAIXA."""

from __future__ import annotations

import warnings
from datetime import datetime
from typing import Dict, List

import pandas as pd

from config import get_http_settings, get_output_dir, load_config
from http_scraper import SessionFetcher, build_error_row
from input_loader import load_base_dataframe
from localiza_informacoes import localiza_informacoes
from supabase_client import init_supabase_client

warnings.filterwarnings("ignore")

CONFIG = load_config()
OUTPUT_DIR = get_output_dir(CONFIG)
EXTRA_CFG: Dict[str, object] = CONFIG.get("extrajudicial", {})
HTTP_SETTINGS = get_http_settings(CONFIG)
SUPABASE_CLIENT = init_supabase_client(CONFIG)
headers = HTTP_SETTINGS["headers"]
cookies = HTTP_SETTINGS["cookies"]
timeout = HTTP_SETTINGS["timeout"]
rate_limit_seconds = HTTP_SETTINGS["rate_limit_seconds"]
session_rotate_every = HTTP_SETTINGS["session_rotate_every"]
retry_settings = HTTP_SETTINGS["retry"]
browser_fallback_settings = HTTP_SETTINGS["browser_fallback"]


def prompt_recent_hours() -> int:
    while True:
        raw = input(
            "\nIgnorar códigos já coletados nas últimas quantas horas? (0 para ignorar nada): "
        ).strip()
        if raw == "":
            return 0
        if raw.isdigit():
            return max(int(raw), 0)
        print("Informe um número inteiro (ex.: 10).")


def prompt_chunk_size(default_chunk: int = 0) -> int:
    print("\nEnviar para o Supabase a cada quantos registros?")
    print("Informe 0 para enviar apenas ao final da execução.")
    while True:
        raw = input(f"Chunk atual ({default_chunk}): ").strip()
        if not raw:
            return default_chunk
        if raw.isdigit():
            return max(int(raw), 0)
        print("Valor inválido. Informe um número inteiro.")

def main() -> None:
    df, source_label = load_base_dataframe(CONFIG)
    print(f"Base carregada de {source_label} ({len(df)} registros).")

    venda_tipos = EXTRA_CFG.get("venda_tipos") or []
    if venda_tipos:
        df = df[df["Tipo de Venda"].isin(venda_tipos)]
    if df.empty:
        print("Nenhum registro encontrado após aplicar filtros de venda.")
        return
    if not SUPABASE_CLIENT.is_configured():
        print("Supabase desabilitado ou incompleto. Configure SUPABASE_URL/SUPABASE_SERVICE_KEY e habilite supabase.enabled.")
        return

    horas_recente = prompt_recent_hours()
    supabase_existentes: set[str] = set()
    if horas_recente > 0:
        supabase_existentes = SUPABASE_CLIENT.fetch_recent_numeros(horas_recente)
        if supabase_existentes:
            print(
                f"Encontrados {len(supabase_existentes)} códigos no Supabase nas últimas {horas_recente}h. "
                "Eles serão ignorados."
            )
        else:
            print("Nenhum código recente encontrado no Supabase para ignorar.")

    chunk_size = prompt_chunk_size()

    fetcher = SessionFetcher(
        headers=headers,
        cookies=cookies,
        timeout=timeout,
        rate_limit_seconds=rate_limit_seconds,
        session_rotate_every=session_rotate_every,
        retry_attempts=retry_settings["attempts"],
        retry_base_delay_seconds=retry_settings["base_delay_seconds"],
        retry_max_delay_seconds=retry_settings["max_delay_seconds"],
        retry_jitter_seconds=retry_settings["jitter_seconds"],
        browser_fallback_enabled=browser_fallback_settings["enabled"],
        browser_fallback_headless=browser_fallback_settings["headless"],
        browser_fallback_timeout_seconds=browser_fallback_settings["timeout_seconds"],
    )
    df_filtered = pd.DataFrame()
    errors: List[Dict[str, object]] = []
    supabase_rows: List[Dict[str, object]] = []
    enviados = 0

    for _, row in df.iterrows():
        codigo_imovel = row["Número do Bem"]
        if supabase_existentes and codigo_imovel in supabase_existentes:
            print(f"Código {codigo_imovel} já no Supabase (janela escolhida). Pulando...")
            continue

        endereco_web = (
            "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp"
            f"?hdnOrigem=index&hdnimovel={codigo_imovel}"
        )
        fetch_result = fetcher.fetch(endereco_web)
        if not fetch_result.soup:
            detalhe_erro = fetch_result.error_type or "http_error"
            status = fetch_result.status_code or "sem_status"
            request_id = fetch_result.azion_request_id or "-"
            print(
                f"Aviso: falha ao obter dados do código {codigo_imovel} "
                f"(tipo={detalhe_erro}, status={status}, tentativas={fetch_result.attempts_used}, "
                f"origem={fetch_result.source}, azion={request_id})."
            )
            errors.append(
                build_error_row(
                    codigo_imovel,
                    motivo="Falha na requisição HTTP",
                    fetch_result=fetch_result,
                )
            )
            continue

        try:
            specific_data = localiza_informacoes(fetch_result.soup, endereco_web)
        except Exception as exc:  # noqa: BLE001
            print(f"Aviso: erro de parse no código {codigo_imovel}: {exc}")
            errors.append(
                build_error_row(
                    codigo_imovel,
                    motivo=f"Erro no parse: {exc}",
                    fetch_result=fetch_result,
                    error_type="parse_error",
                    error_message=str(exc),
                )
            )
            continue

        specific_data["Financiamento"] = specific_data.get("Financia")

        combined = dict(row)
        combined.update(specific_data)
        df_filtered = pd.concat([df_filtered, pd.DataFrame([combined])], ignore_index=True)
        supabase_rows.append(combined)
        enviados += 1

        if len(df_filtered) % 50 == 0:
            print(f"Consultados {len(df_filtered)} registros até agora...")

        if chunk_size > 0 and len(supabase_rows) >= chunk_size:
            SUPABASE_CLIENT.upsert_prospeccao(supabase_rows, fonte="extrajudicial")
            supabase_rows.clear()

    fetcher.close()
    SUPABASE_CLIENT.upsert_prospeccao(supabase_rows, fonte="extrajudicial")

    if errors:
        error_df = pd.DataFrame(errors)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        error_path = OUTPUT_DIR / f"erros_extrajudicial_{timestamp}.csv"
        error_df.to_csv(error_path, index=False)
        print(f"Ocorreram {len(errors)} erros. Consulte {error_path}")
    else:
        print("Execução concluída sem erros.")
    print(f"Enviados ao Supabase: {enviados}")


if __name__ == "__main__":
    main()
