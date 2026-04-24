"""Tests for sandbox/capability_token.py."""

from __future__ import annotations

import pytest

from kairos_cognition.sandbox.capability_token import (
    clear_used_tokens,
    mint_token,
    verify_token,
)


@pytest.fixture(autouse=True)
def _clear_tokens() -> None:
    """Reset the used-token set before every test."""
    clear_used_tokens()


# ---------------------------------------------------------------------------
# Minting
# ---------------------------------------------------------------------------


def test_mint_returns_nonempty_string() -> None:
    token = mint_token("shell_exec", "run-1")
    assert isinstance(token, str)
    assert len(token) > 0


def test_mint_has_exactly_one_dot() -> None:
    token = mint_token("shell_exec", "run-1")
    assert token.count(".") == 1


def test_two_mints_same_args_are_different() -> None:
    """Different nonces must produce different tokens even for identical inputs."""
    t1 = mint_token("shell_exec", "run-1")
    t2 = mint_token("shell_exec", "run-1")
    assert t1 != t2


def test_explicit_nonce_is_deterministic() -> None:
    t1 = mint_token("shell_exec", "run-1", nonce="abc")
    t2 = mint_token("shell_exec", "run-1", nonce="abc")
    assert t1 == t2


# ---------------------------------------------------------------------------
# Verification — success
# ---------------------------------------------------------------------------


def test_verify_fresh_token_succeeds() -> None:
    token = mint_token("file_read", "run-42")
    assert verify_token(token, "file_read", "run-42") is True


def test_verify_accepts_empty_run_id() -> None:
    token = mint_token("memory_store", "")
    assert verify_token(token, "memory_store", "") is True


# ---------------------------------------------------------------------------
# Verification — failures
# ---------------------------------------------------------------------------


def test_verify_wrong_tool_name_fails() -> None:
    token = mint_token("shell_exec", "run-1")
    assert verify_token(token, "file_write", "run-1") is False


def test_verify_wrong_run_id_fails() -> None:
    token = mint_token("shell_exec", "run-1")
    assert verify_token(token, "shell_exec", "run-999") is False


def test_verify_tampered_signature_fails() -> None:
    token = mint_token("shell_exec", "run-1")
    payload, sig = token.split(".", 1)
    tampered = payload + "." + sig[:-4] + "XXXX"
    assert verify_token(tampered, "shell_exec", "run-1") is False


def test_verify_tampered_payload_fails() -> None:
    token = mint_token("shell_exec", "run-1")
    payload, sig = token.split(".", 1)
    tampered = payload[:-2] + "AA" + "." + sig
    assert verify_token(tampered, "shell_exec", "run-1") is False


def test_verify_malformed_no_dot_fails() -> None:
    assert verify_token("notavalidtoken", "shell_exec", "run-1") is False


def test_verify_empty_string_fails() -> None:
    assert verify_token("", "shell_exec", "run-1") is False


# ---------------------------------------------------------------------------
# Single-use enforcement
# ---------------------------------------------------------------------------


def test_verify_single_use_second_call_fails() -> None:
    token = mint_token("shell_exec", "run-1")
    assert verify_token(token, "shell_exec", "run-1") is True
    assert verify_token(token, "shell_exec", "run-1") is False


def test_clear_used_tokens_allows_re_verify() -> None:
    token = mint_token("shell_exec", "run-1", nonce="fixed-nonce")
    assert verify_token(token, "shell_exec", "run-1") is True
    clear_used_tokens()
    # After clearing, the same token can be re-verified (test helper only)
    assert verify_token(token, "shell_exec", "run-1") is True
