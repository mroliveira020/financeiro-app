"""Coletor principal de imóveis a partir da planilha base da CAIXA."""

from __future__ import annotations

import warnings
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Set, Tuple
from zipfile import ZIP_DEFLATED, ZipFile

import pandas as pd
import requests
from bs4 import BeautifulSoup

from localiza_informacoes import localiza_informacoes
from email_utils import open_default_email_client
from config import get_http_settings, get_input_path, get_output_dir, load_config

warnings.filterwarnings("ignore")

CONFIG = load_config()
INPUT_PATH = get_input_path(CONFIG)
OUTPUT_DIR = get_output_dir(CONFIG)
PRINCIPAL_CFG: Dict[str, object] = CONFIG.get("principal", {})
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


def get_saved_codes(output_path: Path, skip_existing: bool) -> Iterable[str]:
    if skip_existing and output_path.exists():
        existing_data = pd.read_excel(output_path)
        if "Número do Bem" in existing_data.columns:
            return existing_data["Número do Bem"].tolist()
    return []


def prompt_resume_choice(output_path: Path) -> str:
    if not output_path.exists():
        return "novo"

    prompt = (
        f"\nArquivo {output_path.name} encontrado. Escolha a ação:\n"
        "[1] Continuar a partir do arquivo existente (ignora códigos já processados)\n"
        "[2] Iniciar nova coleta (renomeia arquivo atual)\n"
        "[3] Cancelar execução\n"
    )

    while True:
        print(prompt)
        choice = input("Selecione 1, 2 ou 3 (padrão: 1): ").strip()
        if choice in {"", "1"}:
            return "continuar"
        if choice == "2":
            return "novo"
        if choice == "3":
            return "cancelar"
        print("Opção inválida. Tente novamente.")


def archive_existing_output(output_path: Path) -> None:
    if not output_path.exists():
        return

    timestamp = datetime.now().strftime("%Y%m%d %H%M")
    archive_name = f"{timestamp} output{output_path.suffix}"
    archive_path = output_path.with_name(archive_name)

    counter = 1
    while archive_path.exists():
        archive_name = f"{timestamp} output ({counter}){output_path.suffix}"
        archive_path = output_path.with_name(archive_name)
        counter += 1

    output_path.rename(archive_path)
    print(f"Arquivo existente renomeado para {archive_path.name}")


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
    print("\nPersistir arquivo a cada quantos registros?")
    print("Informe 0 para salvar apenas ao final da execução.")
    while True:
        raw = input(f"Chunk atual ({default_chunk}): ").strip()
        if not raw:
            return default_chunk
        if raw.isdigit():
            return max(int(raw), 0)
        print("Valor inválido. Informe um número inteiro.")


def write_output(output_path: Path, rows: List[Dict[str, object]]) -> None:
    if not rows:
        return

    df_chunk = pd.DataFrame(rows)

    if output_path.exists():
        existing_data = pd.read_excel(output_path)
        combined_data = pd.concat([existing_data, df_chunk], ignore_index=True)
    else:
        combined_data = df_chunk

    if "Número do Bem" in combined_data.columns:
        combined_data = combined_data.drop_duplicates(subset=["Número do Bem"], keep="last")

    with pd.ExcelWriter(output_path, engine="xlsxwriter") as writer:
        combined_data.to_excel(writer, index=False, sheet_name="Leilões")

        workbook = writer.book
        worksheet = writer.sheets["Leilões"]

        currency_format = workbook.add_format({"num_format": "R$ #,##0.00"})
        worksheet.set_column("V:V", 18, currency_format)
        worksheet.set_column("W:W", 18, currency_format)
        worksheet.set_column("AD:AD", 18, currency_format)
        worksheet.set_column("H:H", 18, currency_format)
        worksheet.set_column("I:I", 18, currency_format)

        number_format = workbook.add_format({"num_format": "0"})
        worksheet.set_column("A:A", 18, number_format)

        for idx, column in enumerate(combined_data.columns):
            if column == "Link de Consulta":
                max_width = max(len("Abrir"), len(str(column)))
            else:
                max_width = max(
                    combined_data[column].astype(str).map(len).max(),
                    len(str(column)),
                )
            worksheet.set_column(idx, idx, max_width)

        if "Link de Consulta" in combined_data.columns:
            link_col_idx = combined_data.columns.get_loc("Link de Consulta")
            link_format = workbook.add_format({"font_color": "blue", "underline": 1})
            for row_idx, url in enumerate(combined_data["Link de Consulta"], start=1):
                if pd.isna(url):
                    continue
                url_str = str(url).strip()
                if not url_str or url_str == "0":
                    continue
                if not url_str.startswith(("http://", "https://")):
                    continue
                worksheet.write_url(
                    row_idx,
                    link_col_idx,
                    url_str,
                    link_format,
                    string="Abrir"
                )

    print(f"Arquivo atualizado: {output_path}")


def prompt_email_recipient() -> str | None:
    choice = input("Deseja enviar o resultado por e-mail? [s/N]: ").strip().lower()
    if choice not in {"s", "sim"}:
        return None

    while True:
        address = input("Informe o e-mail de destino: ").strip()
        if not address:
            print("Endereço vazio. Informe um e-mail válido ou pressione Ctrl+C para cancelar.")
            continue
        if "@" not in address or "." not in address.split("@")[-1]:
            print("Formato de e-mail inválido. Tente novamente.")
            continue
        return address


def create_zip_archive(output_path: Path) -> Path:
    zip_path = output_path.with_suffix(output_path.suffix + ".zip")
    with ZipFile(zip_path, "w", ZIP_DEFLATED) as zf:
        zf.write(output_path, arcname=output_path.name)
    return zip_path


def open_email_client_with_attachment(
    recipient: str,
    output_path: Path,
    zip_path: Path,
) -> None:
    subject = "Resultado garimpo de imóveis"
    body = (
        "Olá,\n\n"
        "Segue em anexo o arquivo consolidado do garimpo. "
        "Caso o anexo não seja adicionado automaticamente, utilize o arquivo a seguir:\n"
        f"- Planilha: {output_path}\n"
        f"- Arquivo ZIP: {zip_path}\n\n"
        "Atenciosamente."
    )

    success = open_default_email_client(recipient, subject, body, attachment_path=zip_path)
    if success:
        print(f"Cliente de e-mail aberto. Anexe o arquivo caso ainda não apareça: {zip_path}")
    else:
        print(
            "Não foi possível abrir automaticamente o cliente de e-mail. "
            f"Envie manualmente usando o arquivo {zip_path}."
        )


def main() -> None:
    if not INPUT_PATH.exists():
        raise FileNotFoundError(f"Planilha base não encontrada em {INPUT_PATH}")

    df = pd.read_excel(INPUT_PATH)
    df_filtered = filter_dataframe(df)

    output_filename = PRINCIPAL_CFG.get("output_filename", "saida.xlsx")
    output_path = OUTPUT_DIR / output_filename
    skip_existing_config = bool(PRINCIPAL_CFG.get("skip_existing", True))

    saved_codes: set[str] = set()
    resume_choice = prompt_resume_choice(output_path)

    if resume_choice == "cancelar":
        print("Execução cancelada pelo usuário.")
        return

    if resume_choice == "novo":
        archive_existing_output(output_path)
    elif output_path.exists():
        saved_codes = set(get_saved_codes(output_path, True))

    skip_existing = skip_existing_config or resume_choice == "continuar"

    chunk_size_cfg = int(PRINCIPAL_CFG.get("chunk_size", 0))
    chunk_size = prompt_chunk_size(chunk_size_cfg)

    if df_filtered.empty:
        print("Nenhum registro encontrado com os filtros selecionados.")
        return

    session = requests.Session()
    collected_rows: List[Dict[str, object]] = []
    errors: List[Dict[str, object]] = []

    total_registros = len(df_filtered)
    processed = 0
    collected = 0

    for position, (_, row) in enumerate(df_filtered.iterrows(), start=1):
        codigo_imovel = row.get("Número do Bem")
        if pd.isna(codigo_imovel):
            continue

        if skip_existing and codigo_imovel in saved_codes:
            print(
                f"[{position}/{total_registros}] Código {codigo_imovel} já consultado. Pulando..."
            )
            continue

        print(f"[{position}/{total_registros}] Consultando código {codigo_imovel}...")
        processed += 1

        endereco_web = (
            "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp"
            f"?hdnOrigem=index&hdnimovel={codigo_imovel}"
        )
        soup = extract_data(endereco_web, session)
        if not soup:
            print(f"   Aviso: falha ao obter dados do código {codigo_imovel}.")
            errors.append({
                "Número do Bem": codigo_imovel,
                "Motivo": "Falha na requisição HTTP"
            })
            continue
        try:
            specific_data = localiza_informacoes(soup, endereco_web)
        except Exception as exc:  # noqa: BLE001
            print(f"   Aviso: erro de parse no código {codigo_imovel}: {exc}")
            errors.append({
                "Número do Bem": codigo_imovel,
                "Motivo": f"Erro no parse: {exc}"
            })
            continue
        combined_data = {col: row[col] for col in df.columns}
        combined_data.update(specific_data)
        combined_data["Data/Hora da Busca"] = pd.to_datetime("now")
        collected_rows.append(combined_data)
        collected += 1
        print(
            f"   Concluído. Coletados {collected} de {processed} processados até agora."
        )

        if chunk_size > 0 and collected % chunk_size == 0:
            write_output(output_path, collected_rows)
            collected_rows.clear()

    if collected_rows:
        write_output(output_path, collected_rows)

    if not output_path.exists():
        print("Nenhum dado coletado para salvar.")
        return

    print(f"Dados salvos com sucesso em {output_path}")

    zip_path = create_zip_archive(output_path)
    print(f"Arquivo compactado disponível em {zip_path}")

    if errors:
        error_df = pd.DataFrame(errors)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        error_path = OUTPUT_DIR / f"erros_principal_{timestamp}.csv"
        error_df.to_csv(error_path, index=False)
        print(f"Ocorreram {len(errors)} erros. Consulte {error_path}")

    recipient = prompt_email_recipient()
    if recipient:
        open_email_client_with_attachment(recipient, output_path, zip_path)


if __name__ == "__main__":
    main()
