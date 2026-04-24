"""Alias metadata and value storage backed by age-encrypted files."""
from __future__ import annotations

import json
import os
import secrets
import tempfile
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from kairos_vault import crypto

_DATA_DIR = Path(os.environ.get("VAULT_DATA_DIR", "/data"))
_VALUES_DIR = _DATA_DIR / "values"
_ALIASES_FILE = _DATA_DIR / "aliases.json.age"


class AliasMetadata(BaseModel):
    alias: str
    description: str
    scope: str
    rotation_interval_days: int
    created_at: str  # ISO8601 UTC
    rotates_at: str  # ISO8601 UTC
    last_accessed: str | None  # ISO8601 UTC or null


def _ensure_dirs() -> None:
    _VALUES_DIR.mkdir(parents=True, exist_ok=True)


def _value_path(alias: str) -> Path:
    # Sanitize alias to prevent path traversal
    safe = alias.replace("/", "_").replace("..", "__")
    return _VALUES_DIR / f"{safe}.age"


def _load_aliases_map() -> dict[str, Any]:
    if not _ALIASES_FILE.exists():
        return {}
    ciphertext = _ALIASES_FILE.read_bytes()
    raw = crypto.decrypt(ciphertext)
    return json.loads(raw.decode())  # type: ignore[no-any-return]


def _save_aliases_map(data: dict[str, Any]) -> None:
    _ensure_dirs()
    payload = json.dumps(data).encode()
    ciphertext = crypto.encrypt(payload)
    _atomic_write(_ALIASES_FILE, ciphertext)


def _atomic_write(path: Path, data: bytes) -> None:
    """Write *data* to *path* atomically using a temp file + rename."""
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def store(alias: str, value: str, metadata: dict[str, Any]) -> AliasMetadata:
    """Encrypt and store *value* for *alias*.

    Raises ``KeyError`` if *alias* already exists.
    """
    _ensure_dirs()
    aliases = _load_aliases_map()
    if alias in aliases:
        raise KeyError(f"Alias already exists: {alias}")

    now = datetime.now(UTC)
    interval = int(metadata.get("rotation_interval_days", 90))
    rotates_at = now + timedelta(days=interval)

    entry: dict[str, Any] = {
        "alias": alias,
        "description": str(metadata.get("description", "")),
        "scope": str(metadata.get("scope", "global")),
        "rotation_interval_days": interval,
        "created_at": now.isoformat(),
        "rotates_at": rotates_at.isoformat(),
        "last_accessed": None,
    }

    # Encrypt value
    ciphertext = crypto.encrypt(value.encode())
    _atomic_write(_value_path(alias), ciphertext)

    # Update alias map
    aliases[alias] = entry
    _save_aliases_map(aliases)

    return AliasMetadata(**entry)


def resolve(alias: str) -> tuple[str, str]:
    """Return ``(plaintext_value, access_id)`` for *alias*.

    ``access_id`` is a new UUID4 for audit correlation.
    Raises ``KeyError`` if alias does not exist.
    Updates ``last_accessed`` in the metadata map.
    """
    aliases = _load_aliases_map()
    if alias not in aliases:
        raise KeyError(f"Unknown alias: {alias}")

    vp = _value_path(alias)
    if not vp.exists():
        raise KeyError(f"Value file missing for alias: {alias}")

    ciphertext = vp.read_bytes()
    plaintext = crypto.decrypt(ciphertext).decode()
    access_id = str(uuid.uuid4())

    # Update last_accessed
    aliases[alias]["last_accessed"] = datetime.now(UTC).isoformat()
    _save_aliases_map(aliases)

    return plaintext, access_id


def get_metadata(alias: str) -> AliasMetadata:
    """Return metadata for *alias*. Raises ``KeyError`` if not found."""
    aliases = _load_aliases_map()
    if alias not in aliases:
        raise KeyError(f"Unknown alias: {alias}")
    return AliasMetadata(**aliases[alias])


def list_aliases() -> list[AliasMetadata]:
    """Return all alias metadata entries."""
    aliases = _load_aliases_map()
    return [AliasMetadata(**v) for v in aliases.values()]


def rotate(alias: str, new_value: str | None = None) -> AliasMetadata:
    """Replace the stored value for *alias*.

    If *new_value* is ``None``, a random 32-byte hex secret is generated.
    Updates ``rotates_at`` based on the alias's rotation interval.
    Raises ``KeyError`` if alias does not exist.
    """
    aliases = _load_aliases_map()
    if alias not in aliases:
        raise KeyError(f"Unknown alias: {alias}")

    value = new_value if new_value is not None else secrets.token_hex(32)
    now = datetime.now(UTC)
    interval = int(aliases[alias].get("rotation_interval_days", 90))
    new_rotates_at = now + timedelta(days=interval)

    ciphertext = crypto.encrypt(value.encode())
    _atomic_write(_value_path(alias), ciphertext)

    aliases[alias]["rotates_at"] = new_rotates_at.isoformat()
    aliases[alias]["last_accessed"] = now.isoformat()
    _save_aliases_map(aliases)

    return AliasMetadata(**aliases[alias])


def count() -> int:
    """Return the total number of stored aliases."""
    return len(_load_aliases_map())


def oldest_access_ms() -> int:
    """Return milliseconds since the oldest last_accessed, or 0 if none accessed."""
    aliases = _load_aliases_map()
    accesses = [
        datetime.fromisoformat(v["last_accessed"])
        for v in aliases.values()
        if v.get("last_accessed")
    ]
    if not accesses:
        return 0
    oldest = min(accesses)
    delta = datetime.now(UTC) - oldest
    return int(delta.total_seconds() * 1000)
