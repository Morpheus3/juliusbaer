"""Per-instrument pricing models for the stress engine. Simple, stated, and applied
consistently: the point is defensibility, not precision."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.impact.shock import Shock

# Region key used in Shock.equity_pct, from the instrument's region field.
REGION_KEY: dict[str, str] = {
    "Global": "global",
    "North America": "north_america",
    "Europe": "europe",
    "Japan": "japan",
    "Asia ex-Japan": "asia_ex_japan",
    "Asia": "asia_ex_japan",
    "Asia Pacific": "asia_ex_japan",
    "Greater China": "greater_china",
    "Hong Kong": "greater_china",
    "Singapore": "asia_ex_japan",
    "Southeast Asia": "asia_ex_japan",
    "South Asia": "asia_ex_japan",
    "Indonesia": "asia_ex_japan",
    "Emerging Markets": "asia_ex_japan",
    "Middle East": "global",
}

# Modified duration by fixed-income sub-asset class when maturity is not in the name.
FUND_DURATION: dict[str, float] = {
    "Investment Grade Credit": 6.0,
    "High Yield Credit": 4.0,
    "Short Duration": 1.5,
    "Emerging Market Debt": 7.0,
    "Inflation Linked": 8.0,
    "Subordinated Perpetual": 5.0,
    "Government Bond": 7.0,
}
SPREAD_DURATION: dict[str, tuple[str, float]] = {
    "Investment Grade Credit": ("ig", 6.0),
    "High Yield Credit": ("hy", 4.0),
    "Emerging Market Debt": ("em", 7.0),
    "Subordinated Perpetual": ("hy", 5.0),
    "Short Duration": ("ig", 1.5),
}
SINGLE_NAME_BETA = 1.2
DIVERSIFIED_BETA = 1.0
LONG_SHORT_BETA = 0.3


@dataclass(frozen=True)
class Priced:
    rates_pct: float = 0.0
    credit_pct: float = 0.0
    equity_pct: float = 0.0
    commodity_pct: float = 0.0
    model: str = "none"
    parameters: dict[str, object] | None = None


def _maturity_year(name: str) -> int | None:
    m = re.search(r"due (\d{4})", name)
    return int(m.group(1)) if m else None


def bond_duration(name: str, sub_asset_class: str, as_of_year: int) -> float:
    year = _maturity_year(name)
    if year is not None:
        years = max(year - as_of_year, 0.25)
        # Coupon-bearing bond: modified duration well below maturity for long bonds.
        return round(min(years * 0.72 + 0.5, 16.0), 2)
    return FUND_DURATION.get(sub_asset_class, 5.0)


def equity_move(
    region: str, sector: str | None, shock: Shock, beta: float
) -> tuple[float, dict[str, object]]:
    region_key = REGION_KEY.get(region, "global")
    base = shock.equity_pct.get(region_key, shock.equity_pct.get("global", 0.0))
    overlay = shock.sector_overlay_pct.get(sector or "", 0.0)
    if sector == "Gold":
        return shock.gold_pct, {"model": "gold spot", "gold_pct": shock.gold_pct}
    move = beta * base + overlay
    return move, {
        "region_key": region_key,
        "region_move_pct": base,
        "sector_overlay_pct": overlay,
        "beta": beta,
    }


def price_instrument(
    *,
    name: str,
    asset_class: str,
    sub_asset_class: str,
    sector: str | None,
    region: str,
    concentration_applies: bool,
    legs: list[dict[str, object]],
    shock: Shock,
    currency: str,
    as_of_year: int,
) -> Priced:
    if asset_class == "Cash and Equivalents":
        return Priced(model="cash: no price move", parameters={})

    if asset_class == "Fixed Income":
        dur = bond_duration(name, sub_asset_class, as_of_year)
        dy = shock.rates_bps.get(currency, 0.0)
        rates = -dur * dy / 100.0
        credit = 0.0
        params: dict[str, object] = {"modified_duration": dur, "rate_shock_bps": dy}
        sd = SPREAD_DURATION.get(sub_asset_class)
        if sd:
            bucket, sdur = sd
            ds = shock.credit_spread_bps.get(bucket, 0.0)
            credit = -sdur * ds / 100.0
            params.update(
                {"spread_bucket": bucket, "spread_duration": sdur, "spread_shock_bps": ds}
            )
        return Priced(
            rates_pct=rates, credit_pct=credit, model="duration x yield change", parameters=params
        )

    if asset_class == "Equity":
        beta = SINGLE_NAME_BETA if concentration_applies else DIVERSIFIED_BETA
        move, params = equity_move(region, sector, shock, beta)
        return Priced(
            equity_pct=move,
            model="beta-adjusted region move plus sector overlay",
            parameters=params,
        )

    if asset_class == "Commodities":
        if sector == "Gold":
            return Priced(
                commodity_pct=shock.gold_pct,
                model="gold spot",
                parameters={"gold_pct": shock.gold_pct},
            )
        move = 0.6 * shock.brent_pct
        return Priced(
            commodity_pct=move, model="0.6 x Brent", parameters={"brent_pct": shock.brent_pct}
        )

    if asset_class == "Alternatives":
        if sub_asset_class in ("Private Equity", "Private Real Estate", "Direct Real Estate"):
            return Priced(
                model="private mark: no immediate revaluation (lagged)",
                parameters={"lag": "quarterly"},
            )
        if sub_asset_class == "Private Credit":
            ds = shock.credit_spread_bps.get("hy", 0.0)
            return Priced(
                credit_pct=-2.0 * ds / 100.0,
                model="spread duration 2 x HY spread",
                parameters={"spread_shock_bps": ds},
            )
        if sub_asset_class == "Hedge Fund":
            if "Long Short" in name or "Long Short" in sector.__str__():
                move, params = equity_move(region, None, shock, LONG_SHORT_BETA)
                return Priced(equity_pct=move, model="long/short beta 0.3", parameters=params)
            return Priced(model="macro hedge fund: assumed flat", parameters={})
        return Priced(model="alternative: assumed flat", parameters={})

    if asset_class == "Structured Products":
        if not legs:
            return Priced(
                model="structured product without look-through: assumed flat", parameters={}
            )
        total = 0.0
        leg_params: list[dict[str, object]] = []
        for leg in legs:
            lm, _params = equity_move(
                str(leg["region"]), str(leg["sector"]), shock, SINGLE_NAME_BETA
            )
            w = float(leg["weight"])  # type: ignore[arg-type]
            if sub_asset_class == "Accumulator":
                mult = 2.0 if lm < 0 else 1.0  # double-up below strike
            elif sub_asset_class == "Capital Protected":
                mult = 1.0 if lm > 0 else 0.0  # protected downside, participation in weight
            else:  # yield enhancement: full downside, capped upside
                mult = 1.0 if lm < 0 else 0.15
            total += w * lm * mult
            leg_params.append(
                {
                    "leg": leg["leg"],
                    "weight": w,
                    "underlying_move_pct": round(lm, 3),
                    "multiplier": mult,
                }
            )
        return Priced(
            equity_pct=total,
            model=f"look-through legs ({sub_asset_class.lower()} payoff)",
            parameters={"legs": leg_params},
        )

    return Priced(model="unmodelled", parameters={})
