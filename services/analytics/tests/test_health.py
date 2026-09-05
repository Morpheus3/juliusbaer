from fastapi.testclient import TestClient

from app.main import app


def test_health_shape(monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setattr("app.db.ping", lambda: False)
    client = TestClient(app)
    body = client.get("/health").json()
    assert body["status"] == "degraded"
    assert body["database_reachable"] is False
    assert body["dataset_today"] == "2026-08-26"
