"""Coleta dados de imóveis em venda direta na CAIXA."""

from __future__ import annotations

import warnings
from datetime import datetime
from typing import Dict, List

import pandas as pd
import requests
from bs4 import BeautifulSoup

from config import get_http_settings, get_output_dir, load_config
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


def extract_data(url: str, session: requests.Session) -> BeautifulSoup | None:
    try:
        response = session.get(url, headers=headers, cookies=cookies, timeout=timeout)
        response.raise_for_status()
        return BeautifulSoup(response.text, "html.parser")
    except requests.RequestException as exc:
        print(f"Erro na solicitação HTTP ({url}): {exc}")
    return None


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

    session = requests.Session()
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
        soup = extract_data(endereco_web, session)
        if not soup:
            errors.append({
                "Número do Bem": codigo_imovel,
                "Motivo": "Falha na requisição HTTP"
            })
            continue

        try:
            specific_data = localiza_informacoes(soup, endereco_web)
        except Exception as exc:  # noqa: BLE001
            errors.append({
                "Número do Bem": codigo_imovel,
                "Motivo": f"Erro no parse: {exc}"
            })
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
