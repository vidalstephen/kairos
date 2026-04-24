"""Tests for age crypto helpers."""
from __future__ import annotations

import pytest

from kairos_vault import crypto


def test_round_trip() -> None:
    plaintext = b"hello vault"
    ct = crypto.encrypt(plaintext)
    assert ct != plaintext
    pt = crypto.decrypt(ct)
    assert pt == plaintext


def test_validate_master_key() -> None:
    # Should succeed with the test passphrase set in conftest
    crypto.validate_master_key()


def test_different_ciphertexts() -> None:
    """Two encryptions of the same value should produce different ciphertexts (age is non-deterministic)."""
    data = b"same-data"
    ct1 = crypto.encrypt(data)
    ct2 = crypto.encrypt(data)
    # pyrage uses random work factors, so ciphertexts differ
    assert ct1 != ct2


def test_decrypt_wrong_passphrase(monkeypatch: pytest.MonkeyPatch) -> None:
    ct = crypto.encrypt(b"data")
    monkeypatch.setenv("VAULT_TEST_PASSPHRASE", "wrong-passphrase")
    with pytest.raises(Exception):
        crypto.decrypt(ct)
