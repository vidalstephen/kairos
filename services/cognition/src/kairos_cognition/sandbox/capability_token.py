"""Capability token minting and verification — Phase 1.10.

Capability tokens are HMAC-SHA256 signed, single-use tokens passed as the
``KAIROS_CAP_TOKEN`` environment variable to each sandboxed executor.

Token format::

    base64url(payload) "." base64url(hmac_sha256(secret, payload))

where ``payload = "{tool_name}:{run_id}:{nonce}"``.

Phase 1 note: tokens are verified by the SandboxService itself.  In Phase 5+,
the executor container verifies the token on entry using the shared HMAC secret
mounted from the credential vault.

Security properties:
- Unforgeable without the HMAC secret.
- Single-use: a token that has already been consumed cannot be replayed.
- Scoped: a token for ``shell_exec`` cannot be used for ``file_read``.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import threading

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

_DEFAULT_SECRET = b"kairos-sandbox-phase1-dev-secret"  # overridden via env in prod
_TOKEN_LOCK = threading.Lock()
_USED_TOKENS: set[str] = set()


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _get_secret() -> bytes:
    raw = os.environ.get("KAIROS_CAP_TOKEN_SECRET", "")
    if raw:
        return raw.encode()
    return _DEFAULT_SECRET


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _decode_b64(s: str) -> bytes:
    # Re-add padding stripped by _b64
    padding = (4 - len(s) % 4) % 4
    return base64.urlsafe_b64decode(s + "=" * padding)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def mint_token(tool_name: str, run_id: str, nonce: str | None = None) -> str:
    """Mint a single-use HMAC-SHA256 capability token.

    Args:
        tool_name: Name of the tool this token authorises.
        run_id:    Identifier of the run that owns this call.
        nonce:     Optional explicit nonce (for testing); a random hex
                   value is generated when omitted.

    Returns:
        A dot-separated ``payload.signature`` string suitable for use as
        the ``KAIROS_CAP_TOKEN`` environment variable.
    """
    if nonce is None:
        nonce = secrets.token_hex(16)
    payload = f"{tool_name}:{run_id}:{nonce}"
    sig = hmac.new(_get_secret(), payload.encode(), hashlib.sha256).digest()
    return f"{_b64(payload.encode())}.{_b64(sig)}"


def verify_token(token: str, tool_name: str, run_id: str) -> bool:
    """Verify and consume a capability token.

    Returns ``True`` only if:
    - The HMAC signature is valid.
    - The payload encodes the expected ``tool_name`` and ``run_id``.
    - The token has not been used before.

    Consuming a token is an atomic operation protected by a lock so
    concurrent verify attempts for the same token both cannot succeed.
    """
    parts = token.split(".", 1)
    if len(parts) != 2:
        return False

    try:
        payload_bytes = _decode_b64(parts[0])
        claimed_sig = _decode_b64(parts[1])
    except Exception:
        return False

    expected_sig = hmac.new(_get_secret(), payload_bytes, hashlib.sha256).digest()
    if not hmac.compare_digest(expected_sig, claimed_sig):
        return False

    payload = payload_bytes.decode(errors="replace")
    fields = payload.split(":")
    if len(fields) != 3:
        return False
    if fields[0] != tool_name or fields[1] != run_id:
        return False

    # Single-use enforcement (thread-safe)
    with _TOKEN_LOCK:
        if token in _USED_TOKENS:
            return False
        _USED_TOKENS.add(token)

    return True


def clear_used_tokens() -> None:
    """Discard the used-token set.

    **Test helper only.**  Calling this in production would re-enable
    replayed tokens and break single-use semantics.
    """
    with _TOKEN_LOCK:
        _USED_TOKENS.clear()
