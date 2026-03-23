"""Coletor principal de imóveis a partir da planilha base da CAIXA."""

from __future__ import annotations

import warnings
from datetime import datetime
from typing import Dict, List, Set, Tuple

import pandas as pd

from config import get_http_settings, get_output_dir, load_config
from http_scraper import SessionFetcher, build_error_row
from input_loader import load_base_dataframe
from localiza_informacoes import localiza_informacoes
from supabase_client import init_supabase_client

warnings.filterwarnings("ignore")

CONFIG = load_config()
OUTPUT_DIR = get_output_dir(CONFIG)
PRINCIPAL_CFG: Dict[str, object] = CONFIG.get("principal", {})
HTTP_SETTINGS = get_http_settings(CONFIG)
SUPABASE_CLIENT = init_supabase_client(CONFIG)
headers = HTTP_SETTINGS["headers"]
cookies = HTTP_SETTINGS["cookies"]
timeout = HTTP_SETTINGS["timeout"]
rate_limit_seconds = HTTP_SETTINGS["rate_limit_seconds"]
session_rotate_every = HTTP_SETTINGS["session_rotate_every"]
retry_settings = HTTP_SETTINGS["retry"]
browser_fallback_settings = HTTP_SETTINGS["browser_fallback"]


def prompt_value_selection(
    label: str,
    options: List[str],
    normalizer,
) -> Set[str]:
    if not options:
        return set()

    while True:
        print(f"\nOpções disponíveis para {label}: {', '.join(options)}")
        raw = input(
            f"Informe {label} separadas por vírgula ou pressione Enter para usar todas: "
        ).strip()
        if not raw:
            return set()
        selected = {normalizer(item) for item in raw.split(",") if item.strip()}
        invalid = selected - {normalizer(option) for option in options}
        if invalid:
            print(f"Valores inválidos para {label}: {', '.join(sorted(invalid))}. Tente novamente.")
            continue
        return selected


def prompt_record_range(total_rows: int) -> Tuple[int, int]:
    if total_rows == 0:
        return (0, 0)

    menu = (
        "\nSelecione como deseja definir o número de registros:\n"
        "[1] Consultar todos\n"
        "[2] Consultar intervalo específico (ex.: 1-100)\n"
        "[3] Consultar quantidade fixa (ex.: 50 primeiros)\n"
    )

    while True:
        print(menu)
        option = input("Escolha 1, 2 ou 3 (padrão: 1): ").strip()
        if option in {"", "1"}:
            return (0, total_rows)

        if option == "2":
            raw = input("Informe o intervalo (ex.: 1-100): ").strip()
            if "-" not in raw:
                print("Formato inválido. Use 'início-fim'.")
                continue
            start_str, end_str = [part.strip() for part in raw.split("-", 1)]
            if not start_str.isdigit() or not end_str.isdigit():
                print("Intervalo inválido. Utilize apenas números.")
                continue
            start = max(int(start_str), 1)
            end = max(int(end_str), start)
            if start > total_rows:
                print("Intervalo inicial maior que o total de registros.")
                continue
            end = min(end, total_rows)
            return (start - 1, end)

        if option == "3":
            raw = input("Informe a quantidade desejada: ").strip()
            if not raw.isdigit():
                print("Quantidade inválida.")
                continue
            amount = max(int(raw), 1)
            end = min(amount, total_rows)
            return (0, end)

        print("Opção inválida. Tente novamente.")


def filter_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    df_filtered = df.copy()

    available_ufs = sorted({str(uf) for uf in df_filtered["UF"].dropna().unique()})
    selected_ufs = prompt_value_selection("UFs", available_ufs, lambda value: value.upper())
    if selected_ufs:
        df_filtered = df_filtered[df_filtered["UF"].isin(selected_ufs)]

    available_modalities = sorted({str(tipo) for tipo in df_filtered["Tipo de Venda"].dropna().unique()})
    selected_modalities = prompt_value_selection(
        "modalidades",
        available_modalities,
        lambda value: value.strip(),
    )
    if selected_modalities:
        df_filtered = df_filtered[df_filtered["Tipo de Venda"].isin(selected_modalities)]

    start, end = prompt_record_range(len(df_filtered))
    df_filtered = df_filtered.iloc[start:end]

    return df_filtered


def prompt_chunk_size(default_chunk: int) -> int:
    print("\nEnviar para o Supabase a cada quantos registros?")
    print("Informe 0 para enviar apenas ao final da execução.")
    while True:
        raw = input(f"Chunk atual ({default_chunk}): ").strip()
        if not raw:
            return default_chunk
        if raw.isdigit():
            return max(int(raw), 0)
        print("Valor inválido. Informe um número inteiro.")


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




def main() -> None:
    df, source_label = load_base_dataframe(CONFIG)
    print(f"Base carregada de {source_label} ({len(df)} registros).")

    df_filtered = filter_dataframe(df)

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

    chunk_size_cfg = int(PRINCIPAL_CFG.get("chunk_size", 0))
    chunk_size = prompt_chunk_size(chunk_size_cfg)

    if df_filtered.empty:
        print("Nenhum registro encontrado com os filtros selecionados.")
        return
    if not SUPABASE_CLIENT.is_configured():
        print("Supabase desabilitado ou incompleto. Configure SUPABASE_URL/SUPABASE_SERVICE_KEY e habilite supabase.enabled.")
        return

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
    supabase_rows: List[Dict[str, object]] = []
    errors: List[Dict[str, object]] = []

    total_registros = len(df_filtered)
    processed = 0
    coletados = 0

    for position, (_, row) in enumerate(df_filtered.iterrows(), start=1):
        codigo_imovel = row.get("Número do Bem")
        if pd.isna(codigo_imovel):
            continue

        if supabase_existentes and codigo_imovel in supabase_existentes:
            print(
                f"[{position}/{total_registros}] Código {codigo_imovel} já no Supabase (janela escolhida). Pulando..."
            )
            continue

        print(f"[{position}/{total_registros}] Consultando código {codigo_imovel}...")
        processed += 1

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
                f"   Aviso: falha ao obter dados do código {codigo_imovel} "
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
            print(f"   Aviso: erro de parse no código {codigo_imovel}: {exc}")
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
        combined_data = {col: row[col] for col in df.columns}
        combined_data.update(specific_data)
        combined_data["Data/Hora da Busca"] = pd.to_datetime("now")
        supabase_rows.append(combined_data)
        coletados += 1
        print(
            f"   Concluído. Coletados {coletados} de {processed} processados até agora."
        )

        if chunk_size > 0 and len(supabase_rows) >= chunk_size:
            SUPABASE_CLIENT.upsert_prospeccao(supabase_rows, fonte="principal")
            supabase_rows.clear()

    fetcher.close()
    SUPABASE_CLIENT.upsert_prospeccao(supabase_rows, fonte="principal")

    if errors:
        error_df = pd.DataFrame(errors)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        error_path = OUTPUT_DIR / f"erros_principal_{timestamp}.csv"
        error_df.to_csv(error_path, index=False)
        print(f"Ocorreram {len(errors)} erros. Consulte {error_path}")
    else:
        print("Execução concluída sem erros.")
    print(f"Processados: {processed} | Enviados ao Supabase: {coletados}")


if __name__ == "__main__":
    main()
