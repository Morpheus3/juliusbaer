"""Build and persist the customer vector for every client."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import psycopg

from app.data.frames import Frames, normalise
from app.features.behavioural import ClientVector, compute_client_vector, percentiles
from app.features.embedding import note_embeddings
from app.features.factual import compute_client_factual
from app.features.fx import Fx
from app.features.manifest import ENGINE_VERSION, MANIFEST
from app.features.peers import nearest_peers


@dataclass
class BuildResult:
    run_id: str | None
    client_count: int
    feature_count: int
    vectors: list[ClientVector]
    factual: dict[str, dict[str, object]]
    percentiles: dict[str, dict[str, float | None]]
    peers: dict[str, list[dict[str, object]]]
    embeddings: dict[str, list[float]]


def build(frames: Frames, today: str) -> BuildResult:
    frames = normalise(frames)
    fx = Fx(frames.market_context)
    ids = sorted(frames.clients.client_id)
    vectors = [compute_client_vector(frames, fx, cid, today) for cid in ids]
    return BuildResult(
        run_id=None,
        client_count=len(ids),
        feature_count=len(MANIFEST),
        vectors=vectors,
        factual={cid: compute_client_factual(frames, fx, cid, today) for cid in ids},
        percentiles=percentiles(vectors),
        peers=nearest_peers(vectors),
        embeddings=note_embeddings(frames.rm_notes, ids),
    )


def persist(conn: psycopg.Connection[Any], result: BuildResult, today: str) -> str:
    """Write one run, replacing the previous run's rows. Returns the run id."""
    manifest_json = json.dumps(
        [
            {
                "name": f.name,
                "label": f.label,
                "unit": f.unit,
                "description": f.description,
                "rubric": f.rubric,
                "higherMeans": f.higher_means,
                "group": f.group,
            }
            for f in MANIFEST
        ]
    )
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("DELETE FROM derived.vector_runs")
        cur.execute(
            "INSERT INTO derived.vector_runs"
            " (dataset_today, engine_version, manifest, client_count)"
            " VALUES (%s, %s, %s::jsonb, %s) RETURNING id",
            (today, ENGINE_VERSION, manifest_json, result.client_count),
        )
        row = cur.fetchone()
        assert row is not None
        run_id = str(row["id"])  # dict_row connection
        for v in result.vectors:
            cur.execute(
                "INSERT INTO derived.client_factual (client_id, run_id, facts)"
                " VALUES (%s, %s, %s::jsonb)",
                (v.client_id, run_id, json.dumps(result.factual[v.client_id], default=str)),
            )
            cur.execute(
                "INSERT INTO derived.client_vectors"
                " (client_id, run_id, features, percentiles, evidence, peers, note_embedding)"
                " VALUES (%s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s::vector)",
                (
                    v.client_id,
                    run_id,
                    json.dumps(v.features),
                    json.dumps(result.percentiles[v.client_id]),
                    json.dumps(v.evidence, default=str),
                    json.dumps(result.peers[v.client_id]),
                    "[" + ",".join(str(x) for x in result.embeddings[v.client_id]) + "]",
                ),
            )
    # Reads earlier on this connection opened an implicit transaction; commit it explicitly.
    conn.commit()
    result.run_id = run_id
    return run_id
