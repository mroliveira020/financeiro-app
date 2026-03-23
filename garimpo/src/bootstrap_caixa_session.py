"""Bootstrap manual de sessão da CAIXA via Playwright."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

from config import BASE_DIR

DEFAULT_URL = "https://venda-imoveis.caixa.gov.br/"
DEFAULT_OUTPUT = "data/session/caixa_cookies.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Abre a CAIXA em navegador controlado e exporta cookies da sessão.",
    )
    parser.add_argument(
        "--url",
        default=DEFAULT_URL,
        help="URL inicial para abrir no navegador.",
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT,
        help="Arquivo JSON de saída para os cookies exportados.",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Executa sem interface gráfica (apenas para testes).",
    )
    return parser.parse_args()


def resolve_output(path_str: str) -> Path:
    path = Path(path_str)
    if not path.is_absolute():
        path = (BASE_DIR / path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def main() -> None:
    args = parse_args()
    output_path = resolve_output(args.output)

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=args.headless)
            context = browser.new_context()
            page = context.new_page()

            print(f"[bootstrap] Abrindo {args.url}")
            page.goto(args.url, wait_until="domcontentloaded", timeout=60000)
            print(f"[bootstrap] URL atual: {page.url}")
            print(f"[bootstrap] Titulo: {page.title()}")
            print("[bootstrap] Se houver challenge/hCaptcha, resolva no navegador.")
            input(
                "[bootstrap] Pressione Enter aqui no terminal quando a sessão estiver pronta para exportar cookies..."
            )

            cookies = context.cookies()
            filtered = [cookie for cookie in cookies if "caixa.gov.br" in cookie.get("domain", "")]
            cookie_map = {cookie["name"]: cookie["value"] for cookie in filtered}

            output_path.write_text(
                json.dumps(cookie_map, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            print(f"[bootstrap] Cookies exportados para {output_path}")
            print(f"[bootstrap] Total de cookies exportados: {len(filtered)}")
            if not filtered:
                print("[bootstrap] Aviso: nenhum cookie de caixa.gov.br foi capturado.")
                print(f"[bootstrap] URL final observada: {page.url}")
                print(f"[bootstrap] Titulo final observado: {page.title()}")
                print(
                    "[bootstrap] Isso normalmente indica que o challenge anti-bot ainda não foi resolvido."
                )

            browser.close()
    except Exception as exc:  # noqa: BLE001
        print(f"[bootstrap] Falha ao iniciar bootstrap: {exc}")
        print("[bootstrap] Se o navegador Chromium ainda não estiver instalado, execute:")
        print("[bootstrap]   backend/venv/bin/playwright install chromium")
        raise


if __name__ == "__main__":
    main()
