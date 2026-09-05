"""Deterministic narrative embedding of the RM notes.

A TF-IDF vector over each client's concatenated notes, projected to a fixed width. This is a
stand-in for a hosted embedding model: it is reproducible, needs no network, and is good
enough for "which clients' notes read alike". Replace with a model-backed embedding later
without changing the storage shape.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

DIMS = 256


def note_embeddings(rm_notes: pd.DataFrame, client_ids: list[str]) -> dict[str, list[float]]:
    docs = [
        " ".join(rm_notes.loc[rm_notes.client_id == cid, "note"].astype(str)) for cid in client_ids
    ]
    vec = TfidfVectorizer(max_features=DIMS, stop_words="english", sublinear_tf=True)
    matrix = vec.fit_transform(docs).toarray()
    padded = np.zeros((len(client_ids), DIMS))
    padded[:, : matrix.shape[1]] = matrix
    return {cid: [round(float(x), 6) for x in padded[i]] for i, cid in enumerate(client_ids)}
