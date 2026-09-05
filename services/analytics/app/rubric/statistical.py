"""Statistical assessor: a gradient-boosted classifier per dimension, trained on an archetype
simulation drawn from the rubric definitions and isotonic-calibrated. It knows nothing the
rules do not encode; its value is catching a score the numbers do not support, and putting a
calibrated probability on the answer. Seeded and disclosed."""

from __future__ import annotations

from functools import lru_cache

import numpy as np
from pydantic import BaseModel
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split

from app.rubric.definitions import Dimension

SEED = 20260826
SAMPLES = 3000

FEATURES: dict[Dimension, list[str]] = {
    "capacity": [
        "cash_pct",
        "withdrawal_count_ytd",
        "withdrawal_pct_aum_ytd",
        "liquidity_runway_months",
        "cash_needs_12m_pct_aum",
        "ltv_headroom_pts",
        "income_yield_pct",
    ],
    "appetite": [
        "risk_asset_pct",
        "stress_behaviour_score",
        "top1_single_line_pct",
        "structured_product_pct",
        "max_drawdown_pct",
        "ltv_change_since_march_pts",
        "source_of_wealth_overlap_pct",
    ],
    "horizon": [
        "stated_horizon_years",
        "avg_holding_period_years",
        "turnover_pct_aum",
        "cash_needs_12m_pct_aum",
        "days_to_next_cash_need",
        "age",
        "illiquid_pct",
    ],
}

# Archetype distributions per level: (low, high) uniform ranges per feature. Where a feature can be
# missing in real data (LTV without a facility) the simulator also injects the neutral fill value.
ARCHETYPES: dict[Dimension, dict[int, dict[str, tuple[float, float]]]] = {
    "capacity": {
        1: {
            "cash_pct": (0, 5),
            "withdrawal_count_ytd": (2, 6),
            "withdrawal_pct_aum_ytd": (2, 8),
            "liquidity_runway_months": (1, 14),
            "cash_needs_12m_pct_aum": (15, 45),
            "ltv_headroom_pts": (-3, 6),
            "income_yield_pct": (0.5, 3),
        },
        2: {
            "cash_pct": (4, 16),
            "withdrawal_count_ytd": (0, 2),
            "withdrawal_pct_aum_ytd": (0, 3),
            "liquidity_runway_months": (10, 70),
            "cash_needs_12m_pct_aum": (3, 22),
            "ltv_headroom_pts": (4, 40),
            "income_yield_pct": (2, 5),
        },
        3: {
            "cash_pct": (12, 50),
            "withdrawal_count_ytd": (0, 1),
            "withdrawal_pct_aum_ytd": (0, 1),
            "liquidity_runway_months": (50, 120),
            "cash_needs_12m_pct_aum": (0, 8),
            "ltv_headroom_pts": (20, 100),
            "income_yield_pct": (3, 8),
        },
    },
    "appetite": {
        1: {
            "risk_asset_pct": (5, 40),
            "stress_behaviour_score": (-1, -0.1),
            "top1_single_line_pct": (0, 8),
            "structured_product_pct": (0, 3),
            "max_drawdown_pct": (0, 6),
            "ltv_change_since_march_pts": (-5, 2),
            "source_of_wealth_overlap_pct": (0, 10),
        },
        2: {
            "risk_asset_pct": (35, 68),
            "stress_behaviour_score": (-0.3, 0.3),
            "top1_single_line_pct": (0, 14),
            "structured_product_pct": (0, 10),
            "max_drawdown_pct": (3, 12),
            "ltv_change_since_march_pts": (-5, 5),
            "source_of_wealth_overlap_pct": (0, 25),
        },
        3: {
            "risk_asset_pct": (60, 100),
            "stress_behaviour_score": (0.2, 1),
            "top1_single_line_pct": (12, 70),
            "structured_product_pct": (5, 30),
            "max_drawdown_pct": (8, 30),
            "ltv_change_since_march_pts": (0, 15),
            "source_of_wealth_overlap_pct": (15, 90),
        },
    },
    "horizon": {
        1: {
            "stated_horizon_years": (1, 6),
            "avg_holding_period_years": (0.2, 3),
            "turnover_pct_aum": (20, 80),
            "cash_needs_12m_pct_aum": (10, 45),
            "days_to_next_cash_need": (0, 60),
            "age": (65, 85),
            "illiquid_pct": (0, 10),
        },
        2: {
            "stated_horizon_years": (4, 15),
            "avg_holding_period_years": (2, 7),
            "turnover_pct_aum": (5, 25),
            "cash_needs_12m_pct_aum": (2, 20),
            "days_to_next_cash_need": (30, 400),
            "age": (45, 70),
            "illiquid_pct": (0, 30),
        },
        3: {
            "stated_horizon_years": (10, 50),
            "avg_holding_period_years": (5, 20),
            "turnover_pct_aum": (0, 10),
            "cash_needs_12m_pct_aum": (0, 6),
            "days_to_next_cash_need": (200, 2000),
            "age": (25, 60),
            "illiquid_pct": (5, 60),
        },
    },
}

NEUTRAL_FILL: dict[str, float] = {
    "ltv_headroom_pts": 30.0,
    "ltv_change_since_march_pts": 0.0,
    "days_to_next_cash_need": 730.0,
    "age": 50.0,
    "liquidity_runway_months": 120.0,
}


class StatResult(BaseModel):
    score: int
    probabilities: dict[str, float]
    calibrated_confidence: float
    top_features: list[dict[str, float | str]]
    model: str
    training: dict[str, float | int]


class _Trained(BaseModel):
    model_config = {"arbitrary_types_allowed": True}
    clf: CalibratedClassifierCV
    importances: list[float]
    holdout_accuracy: float


def _simulate(dimension: Dimension, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    feats = FEATURES[dimension]
    rows: list[list[float]] = []
    labels: list[int] = []
    per_level = SAMPLES // 3
    for level, ranges in ARCHETYPES[dimension].items():
        for _ in range(per_level):
            row = []
            for f in feats:
                lo, hi = ranges[f]
                v = rng.uniform(lo, hi) + rng.normal(0, (hi - lo) * 0.08)
                if f in NEUTRAL_FILL and rng.random() < 0.15:
                    v = NEUTRAL_FILL[f]
                row.append(v)
            rows.append(row)
            labels.append(level)
    return np.asarray(rows, dtype=np.float64), np.asarray(labels)


@lru_cache(maxsize=3)
def _train(dimension: Dimension) -> _Trained:
    rng = np.random.default_rng(SEED)
    x, y = _simulate(dimension, rng)
    x_tr, x_te, y_tr, y_te = train_test_split(x, y, test_size=0.25, random_state=SEED, stratify=y)
    base = GradientBoostingClassifier(
        n_estimators=150, max_depth=3, learning_rate=0.08, random_state=SEED
    )
    clf = CalibratedClassifierCV(base, method="isotonic", cv=5)
    clf.fit(x_tr, y_tr)
    acc = float((clf.predict(x_te) == y_te).mean())
    # Importances from a plain fit for explanation only.
    plain = GradientBoostingClassifier(
        n_estimators=150, max_depth=3, learning_rate=0.08, random_state=SEED
    ).fit(x_tr, y_tr)
    return _Trained(
        clf=clf,
        importances=[float(v) for v in plain.feature_importances_],
        holdout_accuracy=round(acc, 3),
    )


def assess_statistical(dimension: Dimension, features: dict[str, float | None]) -> StatResult:
    trained = _train(dimension)
    names = FEATURES[dimension]
    values: list[float] = []
    for n in names:
        v = features.get(n)
        values.append(NEUTRAL_FILL.get(n, 0.0) if v is None else float(v))
    row = np.asarray([values], dtype=np.float64)
    proba = trained.clf.predict_proba(row)[0]
    classes = [int(c) for c in trained.clf.classes_]
    probs = {str(c): round(float(p), 4) for c, p in zip(classes, proba, strict=True)}
    best = int(classes[int(np.argmax(proba))])
    top = sorted(zip(names, trained.importances, strict=True), key=lambda kv: kv[1], reverse=True)[
        :4
    ]
    return StatResult(
        score=best,
        probabilities=probs,
        calibrated_confidence=round(float(np.max(proba)), 4),
        top_features=[{"feature": n, "importance": round(i, 4)} for n, i in top],
        model="GradientBoosting(150, depth 3) + isotonic calibration",
        training={
            "archetype_samples": SAMPLES,
            "seed": SEED,
            "holdout_accuracy": trained.holdout_accuracy,
        },
    )
