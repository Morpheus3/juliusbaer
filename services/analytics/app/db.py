from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg.rows import DictRow, dict_row

from app.settings import settings


@contextmanager
def connection() -> Iterator[psycopg.Connection[DictRow]]:
    """A short-lived connection. Engines are batch-shaped, so pooling can wait."""
    # The analytics service is a service role: it reads every client to compute percentiles and peers.
    conn = psycopg.connect(settings.database_url, row_factory=dict_row, options="-c app.scope=all")
    try:
        yield conn
    finally:
        conn.close()


def ping() -> bool:
    try:
        with connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1")
            return cur.fetchone() is not None
    except psycopg.Error:
        return False
