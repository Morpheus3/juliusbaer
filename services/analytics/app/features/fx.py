"""Currency conversion from market_context. Pairs follow market convention:
USDXXX is XXX per USD; EURUSD and GBPUSD are USD per unit."""

from __future__ import annotations

import pandas as pd

_USD_PER_UNIT = {"EUR": "EURUSD", "GBP": "GBPUSD"}


class Fx:
    def __init__(self, market_context: pd.DataFrame) -> None:
        self._rates: dict[tuple[str, str], float] = {
            (r.snapshot_date, r.series_id): float(r.value)
            for r in market_context.itertuples(index=False)
        }

    def to_usd(self, amount: float, ccy: str, snapshot_date: str) -> float:
        if ccy == "USD":
            return amount
        if ccy in _USD_PER_UNIT:
            return amount * self._rates[(snapshot_date, _USD_PER_UNIT[ccy])]
        key = (snapshot_date, f"USD{ccy}")
        if key not in self._rates:
            msg = f"no FX rate for {ccy} at {snapshot_date}"
            raise KeyError(msg)
        return amount / self._rates[key]

    def usd_per_unit(self, ccy: str, snapshot_date: str) -> float:
        return self.to_usd(1.0, ccy, snapshot_date)
