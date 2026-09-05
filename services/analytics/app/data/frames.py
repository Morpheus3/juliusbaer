"""Typed access to the raw dataset as pandas frames.

Two sources: Postgres (the running system) and the CSV directory (tests and offline runs).
Both return identical column names so the feature code never knows which it got.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, fields
from pathlib import Path
from typing import Any

import pandas as pd
import psycopg

SNAPSHOT_DATES = ["2025-12-31", "2026-02-27", "2026-03-31", "2026-06-30", "2026-08-26"]
CURRENT = SNAPSHOT_DATES[-1]
BASELINE = SNAPSHOT_DATES[0]


@dataclass(frozen=True)
class Frames:
    clients: pd.DataFrame
    portfolios: pd.DataFrame
    portfolio_aum: pd.DataFrame  # portfolio_id, snapshot_date, aum_base
    holdings: pd.DataFrame
    instruments: pd.DataFrame
    mandates: pd.DataFrame
    transactions: pd.DataFrame
    credit_facilities: pd.DataFrame
    credit_facility_snapshots: pd.DataFrame  # facility_id, snapshot_date, drawn, ..., ltv_pct
    commitments: pd.DataFrame
    planned_cash_needs: pd.DataFrame
    market_context: pd.DataFrame
    event_log: pd.DataFrame
    rm_notes: pd.DataFrame


_RAW_TABLES = [f.name for f in fields(Frames)]


def _unpivot(df: pd.DataFrame, id_col: str, prefix: str, value_col: str) -> pd.DataFrame:
    cols = [f"{prefix}_{d}" for d in SNAPSHOT_DATES]
    long = df[[id_col, *cols]].melt(id_vars=id_col, var_name="snapshot_date", value_name=value_col)
    long["snapshot_date"] = long["snapshot_date"].str.replace(f"{prefix}_", "", regex=False)
    return long


def from_csv_dir(data_dir: Path) -> Frames:
    """Read the dataset directly from data/. Mirrors the unpivoting done by the TS loader."""

    def read(name: str) -> pd.DataFrame:
        return pd.read_csv(data_dir / f"{name}.csv")

    def snapshot_cols(prefix: str) -> list[str]:
        return [f"{prefix}_{d}" for d in SNAPSHOT_DATES]

    portfolios = read("portfolios")
    instruments = read("instruments")
    facilities = read("credit_facilities")

    fac_snaps = None
    for prefix, col in [
        ("drawn", "drawn"),
        ("collateral_market_value", "collateral_market_value"),
        ("lending_value", "lending_value"),
        ("ltv_pct", "ltv_pct"),
        ("headroom", "headroom"),
    ]:
        part = _unpivot(facilities, "facility_id", prefix, col)
        fac_snaps = (
            part
            if fac_snaps is None
            else fac_snaps.merge(part, on=["facility_id", "snapshot_date"])
        )
    assert fac_snaps is not None

    event_log = read("event_log")
    event_log.insert(0, "event_id", [f"EV-{i + 1:03d}" for i in range(len(event_log))])

    notes = pd.DataFrame(json.loads((data_dir / "rm_notes.json").read_text()))

    return Frames(
        clients=read("clients"),
        portfolios=portfolios.drop(columns=snapshot_cols("aum")),
        portfolio_aum=_unpivot(portfolios, "portfolio_id", "aum", "aum_base"),
        holdings=read("holdings"),
        instruments=instruments.drop(columns=snapshot_cols("price")),
        mandates=read("mandates"),
        transactions=read("transactions"),
        credit_facilities=facilities.drop(
            columns=[
                c
                for p in [
                    "drawn",
                    "collateral_market_value",
                    "lending_value",
                    "ltv_pct",
                    "headroom",
                ]
                for c in snapshot_cols(p)
            ]
        ),
        credit_facility_snapshots=fac_snaps,
        commitments=read("commitments"),
        planned_cash_needs=read("planned_cash_needs"),
        market_context=read("market_context"),
        event_log=event_log,
        rm_notes=notes,
    )


def from_postgres(conn: psycopg.Connection[Any]) -> Frames:
    """Read raw.* from Postgres. Column names are already snake_case from Drizzle."""
    out: dict[str, pd.DataFrame] = {}
    for table in _RAW_TABLES:
        with conn.cursor() as cur:
            cur.execute(f'SELECT * FROM raw."{table}"')  # noqa: S608 - fixed table names
            rows = cur.fetchall()
            colnames = [d.name for d in cur.description or []]
        df = pd.DataFrame(rows, columns=colnames)
        for c in df.columns:
            if df[c].dtype == object:
                sample = df[c].dropna()
                if len(sample) and hasattr(sample.iloc[0], "isoformat"):
                    df[c] = df[c].map(lambda v: v.isoformat() if v is not None else None)
        out[table] = df
    # numeric columns arrive as Decimal from psycopg; coerce.
    for df in out.values():
        for c in df.columns:
            if (
                df[c].dtype == object
                and len(df[c].dropna())
                and type(df[c].dropna().iloc[0]).__name__ == "Decimal"
            ):
                df[c] = pd.to_numeric(df[c])
    # sustainability_excluded etc. come back as bool; CSV gives 'Y'/'N'. Normalise to bool.
    inst = out["instruments"]
    for c in ["sustainability_excluded", "concentration_limit_applies"]:
        if inst[c].dtype == object:
            inst[c] = inst[c].map({"Y": True, "N": False})
    return Frames(**out)


def normalise(frames: Frames) -> Frames:
    """Make CSV- and Postgres-sourced frames identical where they differ."""
    inst = frames.instruments.copy()
    for c in ["sustainability_excluded", "concentration_limit_applies"]:
        if inst[c].dtype == object:
            inst[c] = inst[c].map({"Y": True, "N": False})
    clients = frames.clients.copy()
    if clients["pep_status"].dtype == object:
        clients["pep_status"] = clients["pep_status"].map({"Yes": True, "No": False})
    return Frames(
        **{
            **{f.name: getattr(frames, f.name) for f in fields(Frames)},
            "instruments": inst,
            "clients": clients,
        }
    )
