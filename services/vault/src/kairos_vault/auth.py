"""HMAC authentication for internal vault requests."""
from __future__ import annotations

import hashlib
import hmac
import os

from fastapi import Header, HTTPException, Request, status

_VAULT_AUTH_SECRET_ENV = "VAULT_AUTH_SECRET"  # pragma: allowlist secret


def _get_auth_secret() -> bytes:
    secret = os.environ.get(_VAULT_AUTH_SECRET_ENV, "")
    if not secret:
        raise RuntimeError(f"Environment variable {_VAULT_AUTH_SECRET_ENV} is not set")
    return secret.encode()


def _compute_signature(body: bytes) -> str:
    mac = hmac.new(_get_auth_secret(), body, hashlib.sha256)
    return f"sha256={mac.hexdigest()}"


async def verify_internal_auth(
    request: Request,
    x_internal_signature: str = Header(..., alias="X-Internal-Signature"),
    x_internal_service: str = Header(..., alias="X-Internal-Service"),
) -> None:
    """FastAPI dependency — verifies HMAC-SHA256 signature of the request body.

    Raises HTTP 403 if the signature does not match or the auth secret is missing.
    """
    body = await request.body()
    expected = _compute_signature(body)
    if not hmac.compare_digest(expected.encode(), x_internal_signature.encode()):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "Invalid internal signature"},
        )
