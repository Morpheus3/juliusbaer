"""Nearest peers by standardised Euclidean distance over the behavioural vector."""

from __future__ import annotations

import numpy as np

from app.features.behavioural import ClientVector
from app.features.manifest import FEATURE_NAMES

CONTEXT_ONLY = {"age", "stated_risk_score", "ytd_return_pct"}


def nearest_peers(vectors: list[ClientVector], k: int = 3) -> dict[str, list[dict[str, object]]]:
    names = [n for n in FEATURE_NAMES if n not in CONTEXT_ONLY]
    ids = [v.client_id for v in vectors]
    rows: list[list[float]] = []
    for v in vectors:
        row: list[float] = []
        for n in names:
            value = v.features[n]
            row.append(np.nan if value is None else float(value))
        rows.append(row)
    m = np.asarray(rows, dtype=np.float64)
    col_mean = np.nanmean(m, axis=0)
    col_std = np.nanstd(m, axis=0)
    col_std[col_std == 0] = 1.0
    filled = np.where(np.isnan(m), col_mean, m)
    z = (filled - col_mean) / col_std

    out: dict[str, list[dict[str, object]]] = {}
    for i, cid in enumerate(ids):
        d = np.sqrt(((z - z[i]) ** 2).sum(axis=1))
        order = [j for j in np.argsort(d) if j != i][:k]
        peers: list[dict[str, object]] = []
        for j in order:
            diff = np.abs(z[j] - z[i])
            top = np.argsort(diff)[::-1][:3]
            peers.append(
                {
                    "clientId": ids[j],
                    "distance": round(float(d[j]), 3),
                    "differences": [
                        {
                            "feature": names[t],
                            "subject": vectors[i].features[names[t]],
                            "peer": vectors[j].features[names[t]],
                        }
                        for t in top
                    ],
                }
            )
        out[cid] = peers
    return out
