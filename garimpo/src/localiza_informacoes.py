import re
import unicodedata
from urllib.parse import urljoin
from typing import Dict, Any

from bs4 import BeautifulSoup


MONEY_REGEXES = (
    ("Valor Leilao 1", r"Valor mínimo de venda 1º Leilão:\s*R\$\s*([\d.,]+)"),
    ("Valor Leilao 2", r"Valor mínimo de venda 2º Leilão:\s*R\$\s*([\d.,]+)"),
    ("Valor Leilao 1", r"Valor mínimo de venda:\s*R\$\s*([\d.,]+)"),
)

DATE_REGEXES = {
    "Item": r"Número do item:\s*(\d+)",
    "Data Leilao 1": r"Data do 1º Leilão - (\d{2}/\d{2}/\d{4} - \d{2}h\d{2})",
    "Data Leilao 2": r"Data do 2º Leilão - (\d{2}/\d{2}/\d{4} - \d{2}h\d{2})",
    "Data Licitação Aberta": r"Data da Licitação Aberta - (\d{2}/\d{2}/\d{4} - \d{2}h\d{2})",
}

SPAN_LABEL_MAP = {
    "tipo de imóvel": "Tipo de imóvel",
    "situação": "Situação",
    "quartos": "Quartos",
    "número do imóvel": "Número do imóvel",
    "matrícula(s)": "Matrícula(s)",
    "comarca": "Comarca",
    "ofício": "Ofício",
    "inscrição imobiliária": "Inscrição imobiliária",
    "averbação dos leilões negativos": "Averbação dos leilões",
    "área privativa": "Área privativa",
    "área do terreno": "Área do terreno",
    "garagem": "Garagens",
}

NEGATIVE_FINANCING_PATTERNS = (
    "nao aceita financiamento habitacional",
    "nao aceita financiamento",
    "nao permite financiamento",
    "somente recursos proprios",
    "somente recurso proprio",
    "somente recursos do proprio",
    "exclusivamente a vista",
    "exclusivo a vista",
    "somente a vista",
    "formas de pagamento aceitas: recursos proprios",
    "forma de pagamento aceitas: recursos proprios",
    "formas de pagamento: recursos proprios",
    "pagamento com recursos proprios",
)

POSITIVE_FINANCING_PATTERNS = (
    "aceita financiamento habitacional",
    "aceita financiamento imobiliario",
    "aceita financiamento caixa",
    "permite financiamento habitacional",
    "permite financiamento imobiliario",
    "permite financiamento caixa",
    "permite financiamento",
)


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _parse_money(value: str) -> float:
    cleaned = value.replace(".", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _extract_span_values(content: BeautifulSoup) -> Dict[str, Any]:
    results: Dict[str, Any] = {}
    for span in content.find_all("span"):
        text = _clean_text(span.get_text(" ", strip=True)).replace(" = ", ": ")
        if not text or ":" not in text:
            continue
        label, value = [part.strip() for part in text.split(":", 1)]
        key_lookup = label.lower()
        for candidate, canonical in SPAN_LABEL_MAP.items():
            if candidate in key_lookup:
                results[canonical] = value
                break
    return results


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch)).lower()


def _match_any(text: str, patterns: tuple[str, ...]) -> bool:
    return any(pattern in text for pattern in patterns)


def _capture_script_data(script_text: str, data: Dict[str, Any]) -> None:
    data_hora_match = re.search(r"(\d{2}/\d{2}/\d{4} \d{2}:\d{2})", script_text)
    lance_atual_match = re.search(r"(\d{1,3}(?:\.\d{3})*,\d{2})", script_text)
    if data_hora_match:
        data["Data/hora Encerramento"] = data_hora_match.group(1).strip()
    if lance_atual_match:
        data["Lance Atual"] = lance_atual_match.group(1).strip()


def _extract_gallery_photos(soup: BeautifulSoup, base_url: str) -> list[str]:
    gallery = soup.find("div", id="galeria-imagens")
    if not gallery:
        return []

    urls: list[str] = []
    seen: set[str] = set()

    for image in gallery.find_all("img"):
        src = (image.get("src") or "").strip()
        onclick = (image.get("onclick") or "").strip()
        candidates = [src]

        if "preview.src=" in onclick:
            match = re.search(r"preview\.src\s*=\s*['\"]([^'\"]+)['\"]", onclick)
            if match:
                candidates.append(match.group(1).strip())

        for candidate in candidates:
            if not candidate:
                continue
            absolute = urljoin(base_url, candidate)
            if absolute in seen:
                continue
            seen.add(absolute)
            urls.append(absolute)

    return urls


def localiza_informacoes(soup: BeautifulSoup, endereco_web: str) -> Dict[str, Any]:
    data: Dict[str, Any] = {
        "Disponível": None,
        "Financia": None,
        "Valor Leilao 1": None,
        "Valor Leilao 2": None,
        "Item": None,
        "Data Leilao 1": None,
        "Data Leilao 2": None,
        "Site Leiloeiro": None,
        "Link de Consulta": endereco_web,
        "Data/hora Encerramento": None,
        "Lance Atual": None,
        "Data Licitação Aberta": None,
        "Foto URL": None,
        "Fotos": [],
    }

    if not soup:
        return data

    full_text = soup.get_text(" ", strip=True)
    normalized_text = _normalize_text(full_text)

    disponivel_status = "Não" if "não está mais disponível" in full_text.lower() else "Sim"
    data["Disponível"] = disponivel_status

    if disponivel_status == "Sim":
        has_positive = _match_any(normalized_text, POSITIVE_FINANCING_PATTERNS)
        has_negative = _match_any(normalized_text, NEGATIVE_FINANCING_PATTERNS)

        if has_positive:
            data["Financia"] = "Sim"
        elif has_negative:
            data["Financia"] = "Não"

    for key, pattern in DATE_REGEXES.items():
        match = re.search(pattern, full_text, re.IGNORECASE)
        if match:
            data[key] = match.group(1).strip()

    for key, pattern in MONEY_REGEXES:
        match = re.search(pattern, full_text, re.IGNORECASE)
        if match:
            data[key] = _parse_money(match.group(1))

    content_div = soup.find("div", class_="content")
    if content_div:
        span_values = _extract_span_values(content_div)
        data.update(span_values)

    related_div = soup.find("div", class_="related-box")
    if related_div:
        related_text = related_div.get_text(" ", strip=True)
        for key, pattern in DATE_REGEXES.items():
            match = re.search(pattern, related_text, re.IGNORECASE)
            if match:
                data[key] = match.group(1).strip()

    for script_tag in soup.find_all("script"):
        script_text = script_tag.string or script_tag.get_text()
        if script_text and "carregaContador" in script_text:
            _capture_script_data(script_text, data)

    fotos = _extract_gallery_photos(soup, endereco_web)
    if fotos:
        data["Fotos"] = fotos
        data["Foto URL"] = fotos[0]

    return data
