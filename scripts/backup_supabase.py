#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import shutil
import sys
import zipfile
from datetime import datetime
from pathlib import Path

import psycopg2
from psycopg2 import sql


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_ENV_FILE = ROOT_DIR / "backend" / ".env"
DEFAULT_BACKUP_ROOT = ROOT_DIR / ".local_backups" / "supabase"


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def choose_backup_name(now: datetime, backup_root: Path) -> str:
    base_name = now.strftime("%Y%m%d %H%M Backup Supabase")
    if not (backup_root / f"{base_name}.zip").exists() and not (backup_root / base_name).exists():
        return base_name

    for index in range(2, 100):
        candidate = f"{base_name} ({index})"
        if not (backup_root / f"{candidate}.zip").exists() and not (backup_root / candidate).exists():
            return candidate

    raise RuntimeError("Nao foi possivel gerar um nome unico para o backup local.")


def connect_from_env(env: dict[str, str]):
    required_keys = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD", "DB_PORT"]
    missing = [key for key in required_keys if not env.get(key)]
    if missing:
        raise RuntimeError(
            "Variaveis obrigatorias ausentes para conectar no banco: "
            + ", ".join(missing)
        )

    return psycopg2.connect(
        host=env["DB_HOST"],
        dbname=env["DB_NAME"],
        user=env["DB_USER"],
        password=env["DB_PASSWORD"],
        port=env["DB_PORT"],
        sslmode=env.get("DB_SSLMODE", "require"),
    )


def export_schema(cursor, backup_dir: Path) -> list[tuple[int, str, str]]:
    lines: list[str] = []
    lines.append("-- Backup de schema do Supabase")
    lines.append(f"-- Gerado em: {datetime.now().isoformat()}")
    lines.append("")

    cursor.execute(
        """
        SELECT extname
        FROM pg_extension
        WHERE extname <> 'plpgsql'
        ORDER BY extname
        """
    )
    extensions = [row[0] for row in cursor.fetchall()]
    if extensions:
        lines.append("-- Extensions")
        for ext in extensions:
            lines.append(f'CREATE EXTENSION IF NOT EXISTS "{ext}";')
        lines.append("")

    cursor.execute(
        """
        SELECT n.nspname, t.typname,
               string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) AS labels
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
        GROUP BY n.nspname, t.typname
        ORDER BY n.nspname, t.typname
        """
    )
    enum_types = cursor.fetchall()
    if enum_types:
        lines.append("-- Enum types")
        for schema_name, type_name, labels in enum_types:
            lines.append(f'CREATE TYPE "{schema_name}"."{type_name}" AS ENUM ({labels});')
        lines.append("")

    cursor.execute(
        """
        SELECT n.nspname, c.relname,
               format_type(s.seqtypid, NULL) AS data_type,
               s.seqstart, s.seqincrement, s.seqmin, s.seqmax, s.seqcache, s.seqcycle
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_sequence s ON s.seqrelid = c.oid
        WHERE c.relkind = 'S' AND n.nspname = 'public'
        ORDER BY c.relname
        """
    )
    sequences = cursor.fetchall()
    if sequences:
        lines.append("-- Sequences")
        for schema_name, seq_name, data_type, seqstart, seqinc, seqmin, seqmax, seqcache, seqcycle in sequences:
            cycle_sql = " CYCLE" if seqcycle else " NO CYCLE"
            lines.append(
                f'CREATE SEQUENCE "{schema_name}"."{seq_name}" AS {data_type} '
                f"START WITH {seqstart} INCREMENT BY {seqinc} MINVALUE {seqmin} "
                f"MAXVALUE {seqmax} CACHE {seqcache}{cycle_sql};"
            )
        lines.append("")

    cursor.execute(
        """
        SELECT c.oid, n.nspname, c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname = 'public'
        ORDER BY c.relname
        """
    )
    tables = cursor.fetchall()

    if tables:
        lines.append("-- Tables")

    for rel_oid, schema_name, table_name in tables:
        cursor.execute(
            """
            SELECT a.attname,
                   pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
                   a.attnotnull,
                   a.attidentity,
                   pg_get_expr(ad.adbin, ad.adrelid) AS default_expr
            FROM pg_attribute a
            LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
            WHERE a.attrelid = %s
              AND a.attnum > 0
              AND NOT a.attisdropped
            ORDER BY a.attnum
            """,
            (rel_oid,),
        )
        columns = cursor.fetchall()
        column_lines: list[str] = []
        for attname, data_type, attnotnull, attidentity, default_expr in columns:
            parts = [f"{quote_ident(attname)} {data_type}"]
            if attidentity == "a":
                parts.append("GENERATED ALWAYS AS IDENTITY")
            elif attidentity == "d":
                parts.append("GENERATED BY DEFAULT AS IDENTITY")
            elif default_expr is not None:
                parts.append(f"DEFAULT {default_expr}")
            if attnotnull:
                parts.append("NOT NULL")
            column_lines.append("    " + " ".join(parts))

        lines.append(f'CREATE TABLE "{schema_name}"."{table_name}" (')
        lines.append(",\n".join(column_lines))
        lines.append(");")

        cursor.execute(
            """
            SELECT conname, pg_get_constraintdef(oid, true)
            FROM pg_constraint
            WHERE conrelid = %s
            ORDER BY CASE contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'f' THEN 2 WHEN 'c' THEN 3 ELSE 4 END, conname
            """,
            (rel_oid,),
        )
        for conname, condef in cursor.fetchall():
            lines.append(
                f'ALTER TABLE ONLY "{schema_name}"."{table_name}" '
                f"ADD CONSTRAINT {quote_ident(conname)} {condef};"
            )

        cursor.execute(
            """
            SELECT pg_get_indexdef(i.indexrelid)
            FROM pg_index i
            JOIN pg_class idx ON idx.oid = i.indexrelid
            LEFT JOIN pg_constraint c ON c.conindid = i.indexrelid
            WHERE i.indrelid = %s
              AND c.oid IS NULL
            ORDER BY idx.relname
            """,
            (rel_oid,),
        )
        for (indexdef,) in cursor.fetchall():
            lines.append(indexdef + ";")

        cursor.execute(
            """
            SELECT relrowsecurity, relforcerowsecurity
            FROM pg_class
            WHERE oid = %s
            """,
            (rel_oid,),
        )
        rls_enabled, rls_forced = cursor.fetchone()
        if rls_enabled:
            lines.append(f'ALTER TABLE "{schema_name}"."{table_name}" ENABLE ROW LEVEL SECURITY;')
        if rls_forced:
            lines.append(f'ALTER TABLE "{schema_name}"."{table_name}" FORCE ROW LEVEL SECURITY;')

        cursor.execute(
            """
            SELECT policyname, permissive, roles, cmd, qual, with_check
            FROM pg_policies
            WHERE schemaname = %s AND tablename = %s
            ORDER BY policyname
            """,
            (schema_name, table_name),
        )
        for policyname, permissive, roles, cmd, qual, with_check in cursor.fetchall():
            roles_sql = ", ".join(roles) if roles else "public"
            statement = f'CREATE POLICY {quote_ident(policyname)} ON "{schema_name}"."{table_name}"'
            statement += f" AS {permissive.upper()}"
            statement += f" FOR {cmd.upper()}"
            statement += f" TO {roles_sql}"
            if qual:
                statement += f" USING ({qual})"
            if with_check:
                statement += f" WITH CHECK ({with_check})"
            lines.append(statement + ";")

        lines.append("")

    cursor.execute(
        """
        SELECT pg_get_functiondef(p.oid)
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        ORDER BY p.proname
        """
    )
    functions = cursor.fetchall()
    if functions:
        lines.append("-- Functions")
        for (funcdef,) in functions:
            lines.append(funcdef.rstrip() + "\n")

    cursor.execute(
        """
        SELECT schemaname, viewname, definition
        FROM pg_views
        WHERE schemaname = 'public'
        ORDER BY viewname
        """
    )
    views = cursor.fetchall()
    if views:
        lines.append("-- Views")
        for schema_name, view_name, definition in views:
            lines.append(f'CREATE OR REPLACE VIEW "{schema_name}"."{view_name}" AS')
            lines.append(definition.rstrip() + ";")
            lines.append("")

    cursor.execute(
        """
        SELECT schemaname, matviewname, definition
        FROM pg_matviews
        WHERE schemaname = 'public'
        ORDER BY matviewname
        """
    )
    matviews = cursor.fetchall()
    if matviews:
        lines.append("-- Materialized views")
        for schema_name, mv_name, definition in matviews:
            lines.append(f'CREATE MATERIALIZED VIEW "{schema_name}"."{mv_name}" AS')
            lines.append(definition.rstrip() + ";")
            lines.append("")

    cursor.execute(
        """
        SELECT pg_get_triggerdef(t.oid, true)
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal
          AND n.nspname = 'public'
        ORDER BY c.relname, t.tgname
        """
    )
    triggers = cursor.fetchall()
    if triggers:
        lines.append("-- Triggers")
        for (triggerdef,) in triggers:
            lines.append(triggerdef + ";")
        lines.append("")

    (backup_dir / "schema_objects.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return tables


def export_table_data(connection, tables: list[tuple[int, str, str]], backup_dir: Path) -> None:
    output_dir = backup_dir / "tabelas"
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest_lines = [
        f"Backup gerado em: {datetime.now().isoformat()}",
        "",
        "Tabelas exportadas:",
    ]

    for _, schema_name, table_name in tables:
        manifest_lines.append(f"- {schema_name}.{table_name}")
        file_path = output_dir / f"{table_name}.txt"
        with file_path.open("w", encoding="utf-8", newline="") as handle:
            with connection.cursor() as export_cursor:
                copy_sql = sql.SQL(
                    "COPY {}.{} TO STDOUT WITH (FORMAT CSV, HEADER TRUE, ENCODING 'UTF8')"
                ).format(sql.Identifier(schema_name), sql.Identifier(table_name))
                export_cursor.copy_expert(copy_sql.as_string(connection), handle)

    (backup_dir / "manifest.txt").write_text("\n".join(manifest_lines) + "\n", encoding="utf-8")


def zip_backup_directory(backup_dir: Path, zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file_path in sorted(backup_dir.rglob("*")):
            if file_path.is_file():
                archive.write(file_path, file_path.relative_to(backup_dir.parent))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Gera backup local do Supabase em TXT e compacta em ZIP."
    )
    parser.add_argument(
        "--env-file",
        default=str(DEFAULT_ENV_FILE),
        help="Arquivo .env com DB_HOST, DB_NAME, DB_USER, DB_PASSWORD e DB_PORT.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_BACKUP_ROOT),
        help="Diretorio raiz para salvar os backups locais.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    env_file = Path(args.env_file).expanduser().resolve()
    backup_root = Path(args.output_dir).expanduser().resolve()

    if not env_file.exists():
        print(f"Arquivo de ambiente nao encontrado: {env_file}", file=sys.stderr)
        return 1

    backup_root.mkdir(parents=True, exist_ok=True)
    backup_name = choose_backup_name(datetime.now(), backup_root)
    backup_dir = backup_root / backup_name
    zip_path = backup_root / f"{backup_name}.zip"
    backup_dir.mkdir(parents=True, exist_ok=False)

    connection = None
    try:
        env = load_env(env_file)
        connection = connect_from_env(env)
        connection.autocommit = True
        with connection.cursor() as cursor:
            tables = export_schema(cursor, backup_dir)
        export_table_data(connection, tables, backup_dir)
        zip_backup_directory(backup_dir, zip_path)
    except Exception as exc:
        shutil.rmtree(backup_dir, ignore_errors=True)
        if zip_path.exists():
            zip_path.unlink()
        print(f"Erro ao gerar backup do Supabase: {exc}", file=sys.stderr)
        return 1
    finally:
        if connection is not None:
            connection.close()

    print(f"Backup concluido com sucesso.")
    print(f"Pasta: {backup_dir}")
    print(f"Arquivo ZIP: {zip_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
