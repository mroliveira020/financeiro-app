from __future__ import annotations

import os
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict

import yaml

BASE_DIR = Path(__file__).resolve().parent.parent

DEFAULT_HEADERS: Dict[str, str] = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) "
        "Gecko/20100101 Firefox/128.0"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8"
    ),
    "Accept-Language": "pt-BR,pt;q=0.8,en-US;q=0.5,en;q=0.3",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

DEFAULT_CONFIG: Dict[str, Any] = {
    "data": {
        "input": "data/input/base.xlsx",
        "output_dir": "data/output",
        "csv_pattern": "data/input/Lista_imoveis_*.csv",
        "input_mode": "auto",
    },
    "principal": {
        "ufs": ["GO", "SC"],
        "output_filename": "output.xlsx",
        "skip_existing": True,
        "chunk_size": 0,
    },
    "extrajudicial": {
        "venda_tipos": ["Venda Direta", "Venda Direta Online"],
        "output_filename": "output.xlsx",
        "output_financiado_filename": "output_financiado.xlsx",
    },
    "http": {
        "timeout": 5,
        "headers": DEFAULT_HEADERS,
        "cookies": {},
    },
    "email": {
        "enabled": False,
        "smtp_server": "",
        "smtp_port": 587,
        "use_tls": True,
        "username": "",
        "password": "",
        "from_address": "",
    },
    "supabase": {
        "enabled": False,
        "url": "",
        "anon_key": "",
        "service_role_key": "",
        "chunk_size": 500,
        "timeout": 10,
        "retry": {
            "attempts": 3,
            "backoff_seconds": 2,
        },
        "error_log": "data/output/erros_supabase.csv",
    },
}


def _deep_update(target: Dict[str, Any], new_values: Dict[str, Any]) -> Dict[str, Any]:
    for key, value in new_values.items():
        if (
            key in target
            and isinstance(target[key], dict)
            and isinstance(value, dict)
        ):
            _deep_update(target[key], value)
        else:
            target[key] = value
    return target


def load_config() -> Dict[str, Any]:
    """Load configuration from GARIMPO_CONFIG, config.yaml or example defaults."""
    config = deepcopy(DEFAULT_CONFIG)
    config_path = BASE_DIR / "config.yaml"
    example_path = BASE_DIR / "config.yaml.example"

    env_path = os.getenv("GARIMPO_CONFIG")
    if env_path:
        candidate_path = Path(env_path)
        if not candidate_path.is_absolute():
            candidate_path = (BASE_DIR / candidate_path).resolve()
        path_to_use = candidate_path
    else:
        path_to_use = config_path if config_path.exists() else example_path

    if path_to_use and path_to_use.exists():
        with path_to_use.open("r", encoding="utf-8") as fh:
            loaded = yaml.safe_load(fh) or {}
        _deep_update(config, loaded)
    return config


def resolve_path(relative_path: str) -> Path:
    return (BASE_DIR / relative_path).resolve()


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_input_path(config: Dict[str, Any]) -> Path:
    return resolve_path(config["data"]["input"])


def get_output_dir(config: Dict[str, Any]) -> Path:
    return ensure_dir(resolve_path(config["data"]["output_dir"]))


def get_http_settings(config: Dict[str, Any]) -> Dict[str, Any]:
    http_config: Dict[str, Any] = config.get("http", {})
    defaults = DEFAULT_CONFIG["http"]
    return {
        "timeout": http_config.get("timeout", defaults["timeout"]),
        "headers": http_config.get("headers", defaults["headers"]),
        "cookies": http_config.get("cookies", defaults["cookies"]),
    }


def get_email_settings(config: Dict[str, Any]) -> Dict[str, Any]:
    email_config: Dict[str, Any] = config.get("email", {})
    defaults = DEFAULT_CONFIG["email"]
    combined = defaults.copy()
    combined.update(email_config)
    return combined


def get_supabase_settings(config: Dict[str, Any]) -> Dict[str, Any]:
    supabase_cfg: Dict[str, Any] = deepcopy(DEFAULT_CONFIG["supabase"])
    provided = config.get("supabase", {})
    _deep_update(supabase_cfg, provided)

    supabase_cfg["url"] = os.getenv("SUPABASE_URL", supabase_cfg.get("url") or "")
    supabase_cfg["anon_key"] = os.getenv(
        "SUPABASE_ANON_KEY",
        supabase_cfg.get("anon_key") or "",
    )
    supabase_cfg["service_role_key"] = os.getenv(
        "SUPABASE_SERVICE_KEY",
        supabase_cfg.get("service_role_key") or "",
    )
    return supabase_cfg
