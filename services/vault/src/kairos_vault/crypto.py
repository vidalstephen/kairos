"""age encryption/decryption using pyrage passphrase mode."""
from __future__ import annotations

import os
from pathlib import Path

import pyrage

_MASTER_KEY_PATH = Path(os.environ.get("VAULT_MASTER_KEY_PATH", "/run/secrets/master.key"))
_TEST_PASSPHRASE_ENV = "VAULT_TEST_PASSPHRASE"


def _read_passphrase() -> str:
    """Read master passphrase.

    In tests, ``VAULT_TEST_PASSPHRASE`` env var is used instead of the key file.
    In production, the key file must exist and be non-empty.
    """
    test_passphrase = os.environ.get(_TEST_PASSPHRASE_ENV)
    if test_passphrase:
        return test_passphrase

    if not _MASTER_KEY_PATH.exists():
        raise FileNotFoundError(
            f"Master key not found at {_MASTER_KEY_PATH}. "
            "Mount it read-only from the host."
        )
    passphrase = _MASTER_KEY_PATH.read_text().strip()
    if not passphrase:
        raise ValueError(f"Master key at {_MASTER_KEY_PATH} is empty")
    return passphrase


def encrypt(plaintext: bytes) -> bytes:
    """Encrypt *plaintext* with the master passphrase and return age ciphertext."""
    passphrase = _read_passphrase()
    return pyrage.passphrase.encrypt(plaintext, passphrase)


def decrypt(ciphertext: bytes) -> bytes:
    """Decrypt age *ciphertext* using the master passphrase."""
    passphrase = _read_passphrase()
    return pyrage.passphrase.decrypt(ciphertext, passphrase)


def validate_master_key() -> None:
    """Smoke-test that the master key is readable and works for a round-trip.

    Called at startup; raises on failure so the container exits loudly.
    """
    probe = b"kairos-vault-probe"
    ct = encrypt(probe)
    pt = decrypt(ct)
    if pt != probe:
        raise RuntimeError("Master key validation failed: round-trip mismatch")
