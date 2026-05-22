from __future__ import annotations

import argparse
import os
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

from config import get_http_settings, load_config
from http_scraper import SessionFetcher
from localiza_informacoes import localiza_informacoes


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Preenche fotos em imóveis já existentes na base de prospecção.",
    )
    parser.add_argument("--limit", type=int, default=50, help="Quantidade máxima de imóveis para enriquecer.")
    parser.add_argument("--uf", type=str, default="", help="Filtra por UF específica.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root_dir = Path(__file__).resolve().parents[2]
    load_dotenv(root_dir / ".env")
    load_dotenv(root_dir / "backend" / ".env")

    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        port=os.getenv("DB_PORT", "5432"),
    )
    cur = conn.cursor(cursor_factory=RealDictCursor)

    conditions = ["coalesce(v.foto_url, '') = ''"]
    params: list[object] = []
    if args.uf.strip():
        conditions.append("v.uf = %s")
        params.append(args.uf.strip().upper())

    query = f"""
        select v.numero_bem, v.coletado_em, v.link_consulta, v.uf, v.cidade
        from public.vw_imoveis_prospeccao_latest v
        where {' and '.join(conditions)}
          and v.link_consulta is not null
        order by v.coletado_em desc
        limit %s
    """
    params.append(max(args.limit, 1))
    cur.execute(query, params)
    rows = cur.fetchall()

    config = load_config()
    http = get_http_settings(config)
    retry = http["retry"]
    browser = http["browser_fallback"]
    fetcher = SessionFetcher(
        headers=http["headers"],
        cookies=http["cookies"],
        timeout=http["timeout"],
        rate_limit_seconds=http["rate_limit_seconds"],
        session_rotate_every=http["session_rotate_every"],
        retry_attempts=retry["attempts"],
        retry_base_delay_seconds=retry["base_delay_seconds"],
        retry_max_delay_seconds=retry["max_delay_seconds"],
        retry_jitter_seconds=retry["jitter_seconds"],
        browser_fallback_enabled=browser["enabled"],
        browser_fallback_headless=browser["headless"],
        browser_fallback_timeout_seconds=browser["timeout_seconds"],
    )

    atualizados = 0
    for index, row in enumerate(rows, start=1):
        url = row["link_consulta"]
        numero_bem = row["numero_bem"]
        print(f"[{index}/{len(rows)}] {numero_bem} {row['cidade']}/{row['uf']}")
        result = fetcher.fetch(url)
        if not result.soup:
            print(f"   sem HTML utilizável: {result.error_type or result.error_message}")
            continue

        data = localiza_informacoes(result.soup, url)
        foto_url = data.get("Foto URL")
        fotos = data.get("Fotos") or None
        if not foto_url:
            print("   sem foto")
            continue

        cur.execute(
            """
            update public.imoveis_prospeccao
               set foto_url = %s,
                   fotos = %s::jsonb
             where numero_bem = %s
               and coletado_em = %s
            """,
            (foto_url, psycopg2.extras.Json(fotos), numero_bem, row["coletado_em"]),
        )
        atualizados += 1
        print(f"   atualizado com {len(fotos or [])} foto(s)")

    conn.commit()
    fetcher.close()
    cur.close()
    conn.close()
    print(f"Concluído. {atualizados} imóveis atualizados com foto.")


if __name__ == "__main__":
    main()
