"""Carregamento da base (planilha única ou CSVs por UF) com normalização de colunas."""

from __future__ import annotations

import unicodedata
from pathlib import Path
from typing import Iterable, List, Tuple

import pandas as pd

from config import BASE_DIR, get_input_path

EXPECTED_COLUMNS: List[str] = [
    "Número do Bem",
    "Tipo de Venda",
    "Tipo de Imóvel",
    "UF",
    "Cidade",
    "Endereço",
    "Bairro",
    "Valor de Avaliação",
    "Valor de Venda",
    "Desconto",
    "Detalhes",
    "Área Total",
    "Área Privativa",
    "Área do Terreno",
    "Nº de Vagas",
    "Nº de Quartos",
    "Matrícula",
    "Ofício",
]

CSV_SKIPROWS = [0, 1, 3]
CSV_PATTERN_DEFAULT = "data/input/Lista_imoveis_*.csv"

COLUMN_ALIASES = {
    "n do imovel": "Número do Bem",
    "nº do imovel": "Número do Bem",
    "n° do imovel": "Número do Bem",
    "número do bem": "Número do Bem",
    "uf": "UF",
    "cidade": "Cidade",
    "bairro": "Bairro",
    "endereco": "Endereço",
    "endereço": "Endereço",
    "preco": "Valor de Venda",
    "preço": "Valor de Venda",
    "valor de avaliacao": "Valor de Avaliação",
    "descricao": "Detalhes",
    "descrição": "Detalhes",
    "modalidade de venda": "Tipo de Venda",
    "link de acesso": "Link de Consulta",
}


def _strip_strings(df: pd.DataFrame) -> pd.DataFrame:
    for col in df.columns:
        df[col] = df[col].apply(lambda value: value.strip() if isinstance(value, str) else value)
    return df


def _simplify(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    cleaned = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return cleaned.lower().strip()


COLUMN_ALIASES_SIMPLIFIED = {
    _simplify(alias_key): alias_val for alias_key, alias_val in COLUMN_ALIASES.items()
}


def _rename_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename_map = {col: col.strip() for col in df.columns}
    df = df.rename(columns=rename_map)

    final_renames = {}
    for col in df.columns:
        simplified = _simplify(col)
        if simplified in COLUMN_ALIASES_SIMPLIFIED:
            final_renames[col] = COLUMN_ALIASES_SIMPLIFIED[simplified]
    if final_renames:
        df = df.rename(columns=final_renames)
    return df


def _ensure_expected_columns(df: pd.DataFrame) -> pd.DataFrame:
    for column in EXPECTED_COLUMNS:
        if column not in df.columns:
            df[column] = None
    return df


def _drop_empty_codes(df: pd.DataFrame) -> pd.DataFrame:
    if "Número do Bem" not in df.columns:
        return df
    df["Número do Bem"] = df["Número do Bem"].astype(str)
    df = df[df["Número do Bem"].str.strip().astype(bool)]
    return df


def _read_state_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(
        path,
        sep=";",
        encoding="latin-1",
        engine="python",
        skiprows=CSV_SKIPROWS,
        dtype=str,
    )
    df = _strip_strings(df)
    df = _rename_columns(df)
    df = _drop_empty_codes(df)
    return df


def _load_csv_by_state(files: Iterable[Path]) -> pd.DataFrame:
    frames: List[pd.DataFrame] = []
    for file in files:
        frames.append(_read_state_csv(file))
    combined = pd.concat(frames, ignore_index=True)
    combined = _ensure_expected_columns(combined)
    return combined


def _load_excel_base(path: Path) -> pd.DataFrame:
    df = pd.read_excel(path, dtype=str)
    df = _strip_strings(df)
    df = _ensure_expected_columns(df)
    df = _drop_empty_codes(df)
    return df


def _prompt_input_mode(csv_files: List[Path]) -> str:
    prompt = (
        "\nSelecione a fonte da base:\n"
        "[1] Planilha única (data.input)\n"
        "[2] CSVs por estado (Lista_imoveis_*.csv)\n"
    )
    while True:
        print(prompt)
        choice = input("Escolha 1 ou 2 (padrão: 2 se CSVs existirem): ").strip()
        if choice in {"1", "2"}:
            return "excel" if choice == "1" else "csv"
        if choice == "" and csv_files:
            return "csv"
        print("Opção inválida. Tente novamente.")


def _determine_input_mode(config: dict, csv_files: List[Path]) -> str:
    data_cfg = config.get("data", {})
    configured_mode = (data_cfg.get("input_mode") or "auto").lower()
    if configured_mode in {"excel", "csv"}:
        return configured_mode
    if csv_files:
        return _prompt_input_mode(csv_files)
    return "excel"


def load_base_dataframe(config: dict) -> Tuple[pd.DataFrame, str]:
    """Retorna (DataFrame, descrição da fonte usada)."""
    data_cfg = config.get("data", {})
    csv_pattern = data_cfg.get("csv_pattern", CSV_PATTERN_DEFAULT)
    csv_files = sorted(BASE_DIR.glob(csv_pattern))

    mode = _determine_input_mode(config, csv_files)

    if mode == "csv":
        if not csv_files:
            raise FileNotFoundError(
                f"Nenhum CSV encontrado com o padrão '{csv_pattern}'."
            )
        df = _load_csv_by_state(csv_files)
        source = f"CSVs por UF ({len(csv_files)} arquivos)"
    else:
        input_path = get_input_path(config)
        if not input_path.exists():
            raise FileNotFoundError(f"Planilha base não encontrada em {input_path}")
        df = _load_excel_base(input_path)
        source = f"planilha única {input_path}"

    df = _ensure_expected_columns(df)
    df = _drop_empty_codes(df)
    return df, source


def resolve_csv_pattern(config: dict) -> str:
    data_cfg = config.get("data", {})
    return data_cfg.get("csv_pattern", CSV_PATTERN_DEFAULT)
