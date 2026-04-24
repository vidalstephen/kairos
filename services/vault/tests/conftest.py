"""Shared fixtures for vault tests."""
from __future__ import annotations

import os
import tempfile
from collections.abc import Generator
from pathlib import Path

import pytest

# Use a fixed test passphrase instead of the master key file
os.environ.setdefault("VAULT_TEST_PASSPHRASE", "test-vault-passphrase-42")
os.environ.setdefault("VAULT_AUTH_SECRET", "test-vault-auth-secret-99")


@pytest.fixture()
def tmp_data_dir(monkeypatch: pytest.MonkeyPatch) -> Generator[Path, None, None]:
    """Provide a temporary /data directory and patch VAULT_DATA_DIR."""
    with tempfile.TemporaryDirectory() as d:
        data = Path(d)
        (data / "values").mkdir()
        monkeypatch.setenv("VAULT_DATA_DIR", str(data))
        # Patch the module-level constants in storage
        import kairos_vault.storage as s
        monkeypatch.setattr(s, "_DATA_DIR", data)
        monkeypatch.setattr(s, "_VALUES_DIR", data / "values")
        monkeypatch.setattr(s, "_ALIASES_FILE", data / "aliases.json.age")
        yield data
