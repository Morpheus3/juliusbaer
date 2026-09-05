"""The three-dimension rubric, worded as on the wireframe. Served to the UI and the LLM prompt."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

Dimension = Literal["capacity", "appetite", "horizon"]
DIMENSIONS: list[Dimension] = ["capacity", "appetite", "horizon"]


class Level(BaseModel):
    score: int
    label: str
    description: str


class Definition(BaseModel):
    dimension: Dimension
    title: str
    subtitle: str
    levels: list[Level]


DEFINITIONS: list[Definition] = [
    Definition(
        dimension="capacity",
        title="Risk Capacity",
        subtitle="Financial ability to bear risk",
        levels=[
            Level(
                score=1,
                label="Erratic / Strained",
                description="Frequent unplanned withdrawals, cash buffer below 5%, leverage or near-term liabilities that force sales.",
            ),
            Level(
                score=2,
                label="Stable / Neutral",
                description="Regular inflows, occasional withdrawals, cash 5-15%, liabilities covered by liquid assets.",
            ),
            Level(
                score=3,
                label="Robust",
                description="Consistent growing deposits, no forced liquidity, AUM can absorb a 30% drop without changing plans.",
            ),
        ],
    ),
    Definition(
        dimension="appetite",
        title="Risk Appetite",
        subtitle="Behavioural tolerance to volatility",
        levels=[
            Level(
                score=1,
                label="Conservative",
                description="Flight to safety, sells dips, low structural allocation to risk assets, asks for 'safe and boring'.",
            ),
            Level(
                score=2,
                label="Moderate",
                description="Holds the line in drawdowns, balanced allocation, systematic rebalancing.",
            ),
            Level(
                score=3,
                label="Aggressive",
                description="Buys dips, structurally overweights high-beta or concentrated positions, adds leverage into volatility.",
            ),
        ],
    ),
    Definition(
        dimension="horizon",
        title="Investment Horizon",
        subtitle="Effective investment timeframe",
        levels=[
            Level(
                score=1,
                label="Short (under 3 years)",
                description="High turnover, short holding periods, active or recurring withdrawals, large near-term cash needs.",
            ),
            Level(
                score=2,
                label="Medium (3-7 years)",
                description="Moderate turnover, mix of core and tactical positions, dated liabilities inside the decade.",
            ),
            Level(
                score=3,
                label="Long (7+ years)",
                description="Buy-and-hold, retirement or multi-generational accounts, no scheduled withdrawals.",
            ),
        ],
    ),
]
