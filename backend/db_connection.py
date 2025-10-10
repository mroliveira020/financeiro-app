import os
import threading

import psycopg2
from psycopg2 import extras, pool
from dotenv import load_dotenv

# Carregar variáveis do arquivo .env
load_dotenv()

_POOL_LOCK = threading.Lock()
_POOL = None


class ConnectionWrapper:
    def __init__(self, conn, pool_obj):
        self._conn = conn
        self._pool = pool_obj

    def __getattr__(self, name):
        return getattr(self._conn, name)

    def close(self):
        if self._conn is None:
            return
        try:
            if not self._conn.closed:
                self._conn.rollback()
        except Exception:
            pass
        finally:
            self._pool.putconn(self._conn)
            self._conn = None


def _init_pool():
    global _POOL
    if _POOL is not None:
        return _POOL

    with _POOL_LOCK:
        if _POOL is None:
            min_conn = int(os.getenv("DB_POOL_MIN", "1"))
            max_conn = int(os.getenv("DB_POOL_MAX", "5"))
            if max_conn < min_conn:
                max_conn = min_conn

            conn_params = {
                "host": os.getenv("DB_HOST"),
                "database": os.getenv("DB_NAME"),
                "user": os.getenv("DB_USER"),
                "password": os.getenv("DB_PASSWORD"),
                "port": os.getenv("DB_PORT", "5432"),
            }

            _POOL = pool.SimpleConnectionPool(min_conn, max_conn, **conn_params)
    return _POOL


def conectar():
    """Obtém conexão (pooling) com cursor DictCursor."""
    pool_obj = _init_pool()
    conn = pool_obj.getconn()
    conn.autocommit = False
    wrapper = ConnectionWrapper(conn, pool_obj)
    cursor = conn.cursor(cursor_factory=extras.DictCursor)
    return wrapper, cursor
