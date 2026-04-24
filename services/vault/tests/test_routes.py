"""Integration tests for vault HTTP routes."""
from __future__ import annotations

import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

import kairos_vault.storage as storage
from kairos_vault.main import app

_SECRET = b"test-vault-auth-secret-99"


def _sign(body: bytes) -> str:
    mac = hmac.new(_SECRET, body, hashlib.sha256)
    return f"sha256={mac.hexdigest()}"


def _headers(body: bytes) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "X-Internal-Service": "control-plane",
        "X-Internal-Signature": _sign(body),
    }


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app, raise_server_exceptions=True)


# ── /vault/health ─────────────────────────────────────────────────────────────


def test_health(client: TestClient, tmp_data_dir: object) -> None:
    resp = client.get("/vault/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["entries"] == 0


# ── /vault/store ──────────────────────────────────────────────────────────────


def test_store_creates_alias(client: TestClient, tmp_data_dir: object) -> None:
    body = json.dumps({
        "alias": "kairos-smtp-pass",
        "value": "smtp-secret-value",  # pragma: allowlist secret
        "metadata": {"description": "SMTP password", "scope": "global"},
    }).encode()
    resp = client.post("/vault/store", content=body, headers=_headers(body))
    assert resp.status_code == 201
    assert resp.json()["stored"] is True


def test_store_conflict(client: TestClient, tmp_data_dir: object) -> None:
    body = json.dumps({
        "alias": "conflict-alias",
        "value": "v",
        "metadata": {"description": "d"},
    }).encode()
    client.post("/vault/store", content=body, headers=_headers(body))
    resp = client.post("/vault/store", content=body, headers=_headers(body))
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "alias_exists"


# ── /vault/resolve ────────────────────────────────────────────────────────────


def test_resolve_returns_value(client: TestClient, tmp_data_dir: object) -> None:
    storage.store("resolve-test", "my-secret", {"description": "R"})  # pragma: allowlist secret

    body = json.dumps({
        "alias": "resolve-test",
        "caller": "control-plane",
        "purpose": "tool-dispatch",
    }).encode()
    resp = client.post("/vault/resolve", content=body, headers=_headers(body))
    assert resp.status_code == 200
    data = resp.json()
    assert data["resolved"] == "my-secret"  # pragma: allowlist secret
    assert "access_id" in data


def test_resolve_unknown(client: TestClient, tmp_data_dir: object) -> None:
    body = json.dumps(
        {"alias": "ghost", "caller": "cp", "purpose": "p"}
    ).encode()
    resp = client.post("/vault/resolve", content=body, headers=_headers(body))
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "unknown_alias"


# ── /vault/metadata ───────────────────────────────────────────────────────────


def test_metadata(client: TestClient, tmp_data_dir: object) -> None:
    storage.store("meta-alias", "v", {"description": "Meta desc", "scope": "ws-1"})

    body = json.dumps({"alias": "meta-alias"}).encode()
    resp = client.post("/vault/metadata", content=body, headers=_headers(body))
    assert resp.status_code == 200
    data = resp.json()
    assert data["alias"] == "meta-alias"
    assert data["scope"] == "ws-1"


def test_metadata_unknown(client: TestClient, tmp_data_dir: object) -> None:
    body = json.dumps({"alias": "nope"}).encode()
    resp = client.post("/vault/metadata", content=body, headers=_headers(body))
    assert resp.status_code == 404


# ── /vault/rotate ─────────────────────────────────────────────────────────────


def test_rotate(client: TestClient, tmp_data_dir: object) -> None:
    storage.store("rotate-alias", "old", {"description": "Rotate me"})

    body = json.dumps({"alias": "rotate-alias", "new_value": "new-val"}).encode()
    resp = client.post("/vault/rotate", content=body, headers=_headers(body))
    assert resp.status_code == 200
    data = resp.json()
    assert "rotated_at" in data
    assert "new_rotates_at" in data

    # Value should be updated
    value, _ = storage.resolve("rotate-alias")
    assert value == "new-val"


# ── /vault/aliases ────────────────────────────────────────────────────────────


def test_aliases_list(client: TestClient, tmp_data_dir: object) -> None:
    storage.store("al1", "v1", {"description": "A1"})
    storage.store("al2", "v2", {"description": "A2"})

    body = b""
    resp = client.get(
        "/vault/aliases",
        headers={
            "X-Internal-Service": "control-plane",
            "X-Internal-Signature": _sign(body),
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert {a["alias"] for a in data} == {"al1", "al2"}
