"""Process drill only (issue 11); never merged."""
from fastapi.testclient import TestClient

from townpass_backend.main import app


def test_health_answers() -> None:
    assert TestClient(app).get("/health").status_code == 200
