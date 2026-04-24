"""Tests for HMAC authentication."""
from __future__ import annotations

import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from kairos_vault.main import app

_SECRET = b"test-vault-auth-secret-99"


def _sign(body: bytes) -> str:
    mac = hmac.new(_SECRET, body, hashlib.sha256)
    return f"sha256={mac.hexdigest()}"


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app, raise_server_exceptions=True)


def test_health_requires_no_auth(client: TestClient) -> None:
    resp = client.get("/vault/health")
    assert resp.status_code == 200


def test_resolve_requires_signature(client: TestClient) -> None:
    resp = client.post(
        "/vault/resolve",
        json={"alias": "kairos-test", "caller": "test", "purpose": "test"},
    )
    # Missing X-Internal-Signature and X-Internal-Service headers → 422 (missing header)
    assert resp.status_code == 422


def test_resolve_rejects_bad_signature(client: TestClient) -> None:
    body = json.dumps({"alias": "k", "caller": "cp", "purpose": "p"}).encode()
    resp = client.post(
        "/vault/resolve",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Internal-Service": "control-plane",
            "X-Internal-Signature": "sha256=badbadbadbad",
        },
    )
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "forbidden"


def test_resolve_accepts_valid_signature(
    client: TestClient,
    tmp_data_dir: object,
) -> None:
    """A correct signature passes auth (will 404 since alias not stored, not 403)."""
    import kairos_vault.storage as s

    s.store("kairos-test", "secret-value", {"description": "t", "scope": "global"})

    body = json.dumps(
        {"alias": "kairos-test", "caller": "control-plane", "purpose": "test-purpose"}
    ).encode()
    resp = client.post(
        "/vault/resolve",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Internal-Service": "control-plane",
            "X-Internal-Signature": _sign(body),
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["resolved"] == "secret-value"
    assert "access_id" in data
