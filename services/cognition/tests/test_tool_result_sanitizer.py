"""Tests for tools/result_sanitizer.py."""

from __future__ import annotations

import pytest

from kairos_cognition.tools.result_sanitizer import (
    _MAX_RESULT_CHARS,
    ResultFlag,
    ToolResultSanitizer,
)


@pytest.fixture()
def sanitizer() -> ToolResultSanitizer:
    return ToolResultSanitizer()


# ---------------------------------------------------------------------------
# Clean output
# ---------------------------------------------------------------------------


def test_clean_output_passes_through(sanitizer: ToolResultSanitizer) -> None:
    result = sanitizer.sanitize("hello world")
    assert result.output == "hello world"
    assert result.flags == []
    assert not result.was_truncated


def test_empty_string_ok(sanitizer: ToolResultSanitizer) -> None:
    result = sanitizer.sanitize("")
    assert result.output == ""
    assert result.flags == []


# ---------------------------------------------------------------------------
# Credential redaction
# ---------------------------------------------------------------------------


def test_generic_api_key_redacted(sanitizer: ToolResultSanitizer) -> None:
    output = "api_key=supersecretvalue12345678"
    result = sanitizer.sanitize(output)
    assert "supersecretvalue12345678" not in result.output
    assert "[REDACTED]" in result.output
    assert ResultFlag.CREDENTIAL_REDACTED in result.flags


def test_aws_key_redacted(sanitizer: ToolResultSanitizer) -> None:
    output = "AKIAIOSFODNN7EXAMPLE is the access key"  # pragma: allowlist secret
    result = sanitizer.sanitize(output)
    assert "AKIAIOSFODNN7EXAMPLE" not in result.output  # pragma: allowlist secret
    assert ResultFlag.CREDENTIAL_REDACTED in result.flags


def test_github_token_redacted(sanitizer: ToolResultSanitizer) -> None:
    output = "token: ghp_ABCdefGHIjklMNOpqrSTUvwxYZabcdefghij"  # pragma: allowlist secret
    result = sanitizer.sanitize(output)
    assert (
        "ghp_ABCdefGHIjklMNOpqrSTUvwxYZabcdefghij" not in result.output
    )  # pragma: allowlist secret
    assert ResultFlag.CREDENTIAL_REDACTED in result.flags


def test_private_key_header_redacted(sanitizer: ToolResultSanitizer) -> None:
    output = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAK..."  # pragma: allowlist secret
    result = sanitizer.sanitize(output)
    assert ResultFlag.CREDENTIAL_REDACTED in result.flags


def test_multiple_credentials_all_redacted(sanitizer: ToolResultSanitizer) -> None:
    output = "api_key=secret12345678901234567 and AKIAIOSFODNN7EXAMPLE"  # pragma: allowlist secret
    result = sanitizer.sanitize(output)
    assert ResultFlag.CREDENTIAL_REDACTED in result.flags
    # Only one flag even if multiple matches
    assert result.flags.count(ResultFlag.CREDENTIAL_REDACTED) == 1


# ---------------------------------------------------------------------------
# PII detection (flag only, not redacted)
# ---------------------------------------------------------------------------


def test_email_flagged_not_redacted(sanitizer: ToolResultSanitizer) -> None:
    output = "Contact user@example.com for info"
    result = sanitizer.sanitize(output)
    assert ResultFlag.PII_DETECTED in result.flags
    assert "user@example.com" in result.output  # PII not stripped in Phase 1


def test_ssn_flagged(sanitizer: ToolResultSanitizer) -> None:
    output = "SSN: 123-45-6789"
    result = sanitizer.sanitize(output)
    assert ResultFlag.PII_DETECTED in result.flags


def test_pii_flag_only_once(sanitizer: ToolResultSanitizer) -> None:
    output = "email: a@b.com and also c@d.org"
    result = sanitizer.sanitize(output)
    assert result.flags.count(ResultFlag.PII_DETECTED) == 1


# ---------------------------------------------------------------------------
# Size cap
# ---------------------------------------------------------------------------


def test_size_cap_truncates(sanitizer: ToolResultSanitizer) -> None:
    output = "z" * (_MAX_RESULT_CHARS + 1000)
    result = sanitizer.sanitize(output)
    assert result.was_truncated
    assert ResultFlag.SIZE_TRUNCATED in result.flags
    assert "[truncated]" in result.output


def test_size_cap_exact_boundary_not_truncated(sanitizer: ToolResultSanitizer) -> None:
    output = "z" * _MAX_RESULT_CHARS
    result = sanitizer.sanitize(output)
    assert not result.was_truncated


# ---------------------------------------------------------------------------
# Flag deduplication
# ---------------------------------------------------------------------------


def test_flags_are_deduplicated(sanitizer: ToolResultSanitizer) -> None:
    """If both credential and PII are present, each flag appears exactly once."""
    output = "api_key=secret12345678901234567 and user@example.com"
    result = sanitizer.sanitize(output)
    assert result.flags.count(ResultFlag.CREDENTIAL_REDACTED) == 1
    assert result.flags.count(ResultFlag.PII_DETECTED) == 1
