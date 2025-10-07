"""Coleta dados de imóveis em venda direta na CAIXA."""

from __future__ import annotations

import warnings
from datetime import datetime
from typing import Dict, Iterable, List

import pandas as pd
import requests
from bs4 import BeautifulSoup

from config import get_http_settings, get_input_path, get_output_dir, load_config
from localiza_informacoes import localiza_informacoes

warnings.filterwarnings("ignore")

CONFIG = load_config()
INPUT_PATH = get_input_path(CONFIG)
OUTPUT_DIR = get_output_dir(CONFIG)
EXTRA_CFG: Dict[str, object] = CONFIG.get("extrajudicial", {})
HTTP_SETTINGS = get_http_settings(CONFIG)
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

def main() -> None:
    if not INPUT_PATH.exists():
        raise FileNotFoundError(f"Planilha base não encontrada em {INPUT_PATH}")

    df = pd.read_excel(INPUT_PATH)

    venda_tipos = EXTRA_CFG.get("venda_tipos") or []
    if venda_tipos:
        df = df[df["Tipo de Venda"].isin(venda_tipos)]

    output_path = OUTPUT_DIR / EXTRA_CFG.get("output_filename", "output.xlsx")
    output_financiado_path = OUTPUT_DIR / EXTRA_CFG.get(
        "output_financiado_filename", "output_financiado.xlsx"
    )

    existing_numbers: Iterable[str] = []
    if output_path.exists():
        existing_df = pd.read_excel(output_path)
        if "Número do Bem" in existing_df.columns:
            existing_numbers = existing_df["Número do Bem"].unique().tolist()

    session = requests.Session()
    df_filtered = pd.DataFrame()
    errors: List[Dict[str, object]] = []

    for _, row in df.iterrows():
        codigo_imovel = row["Número do Bem"]
        if codigo_imovel in existing_numbers:
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

        if len(df_filtered) % 50 == 0:
            print(f"Consultados {len(df_filtered)} registros até agora...")

    if df_filtered.empty:
        print("Nenhum dado coletado. Nada a salvar.")
        return

    if "Número do Bem" in df_filtered.columns:
        df_filtered = df_filtered.drop_duplicates(subset=["Número do Bem"], keep="last")

    df_filtered.to_excel(output_path, index=False)
    print(f"Dados salvos em {output_path}")

    df_financiado = df_filtered[
        (df_filtered["Financiamento"] == "Sim")
        & (df_filtered["Disponível"] == "Sim")
    ]
    df_financiado.to_excel(output_financiado_path, index=False)
    print(f"Dados financiáveis salvos em {output_financiado_path}")

    if errors:
        error_df = pd.DataFrame(errors)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        error_path = OUTPUT_DIR / f"erros_extrajudicial_{timestamp}.csv"
        error_df.to_csv(error_path, index=False)
        print(f"Ocorreram {len(errors)} erros. Consulte {error_path}")


if __name__ == "__main__":
    main()
