"""The factor shock vector. Mirrors `Shock` in packages/contracts."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["mild", "base", "severe"]
SEVERITY_MULTIPLIER: dict[Severity, float] = {"mild": 0.5, "base": 1.0, "severe": 2.0}


class Shock(BaseModel):
    rates_bps: dict[str, float] = Field(default_factory=dict)
    credit_spread_bps: dict[str, float] = Field(default_factory=dict)
    equity_pct: dict[str, float] = Field(default_factory=dict)
    sector_overlay_pct: dict[str, float] = Field(default_factory=dict)
    fx_pct_vs_usd: dict[str, float] = Field(default_factory=dict)
    gold_pct: float = 0.0
    brent_pct: float = 0.0
    vix_points: float = 0.0

    def scaled(self, k: float) -> Shock:
        return Shock(
            rates_bps={c: v * k for c, v in self.rates_bps.items()},
            credit_spread_bps={c: v * k for c, v in self.credit_spread_bps.items()},
            equity_pct={c: v * k for c, v in self.equity_pct.items()},
            sector_overlay_pct={c: v * k for c, v in self.sector_overlay_pct.items()},
            fx_pct_vs_usd={c: v * k for c, v in self.fx_pct_vs_usd.items()},
            gold_pct=self.gold_pct * k,
            brent_pct=self.brent_pct * k,
            vix_points=self.vix_points * k,
        )

    @staticmethod
    def combine(shocks: list[Shock]) -> Shock:
        """Sum factor moves. Stacking several signals is additive by design and stated as such."""
        out = Shock()
        for s in shocks:
            for c, v in s.rates_bps.items():
                out.rates_bps[c] = out.rates_bps.get(c, 0.0) + v
            for c, v in s.credit_spread_bps.items():
                out.credit_spread_bps[c] = out.credit_spread_bps.get(c, 0.0) + v
            for c, v in s.equity_pct.items():
                out.equity_pct[c] = out.equity_pct.get(c, 0.0) + v
            for c, v in s.sector_overlay_pct.items():
                out.sector_overlay_pct[c] = out.sector_overlay_pct.get(c, 0.0) + v
            for c, v in s.fx_pct_vs_usd.items():
                out.fx_pct_vs_usd[c] = out.fx_pct_vs_usd.get(c, 0.0) + v
            out.gold_pct += s.gold_pct
            out.brent_pct += s.brent_pct
            out.vix_points += s.vix_points
        return out
