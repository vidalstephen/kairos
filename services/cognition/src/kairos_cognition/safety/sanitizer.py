"""Safety sanitizer module.

Validates model output before it is surfaced to the user or forwarded
to another subsystem.  Phase 1 scope:

  - Credential leak detection (API keys, tokens, passwords)
  - PII pattern detection (email, phone, SSN — flagged, not stripped)
  - Prompt-injection signal detection
  - Response size cap

Phase 2 will add: allowlist-based egress domain check on URLs in output,
richer PII stripping, and integration with the approval flow for
flagged content.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import StrEnum

# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

# Credential patterns — conservative; aim for high-recall
_CREDENTIAL_PATTERNS: list[re.Pattern] = [
    # Generic secret key / token / api_key = ...
    re.compile(
        r"(?i)(api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token"
        r"|bearer\s+[A-Za-z0-9\-._~+/]+=*"
        r"|password)\s*[=:]\s*['\"]?[A-Za-z0-9+/=\-_.]{16,}['\"]?",
    ),
    # AWS-style access key IDs
    re.compile(r"(?<![A-Z0-9])(AKIA|AGPA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}"),
    # GitHub tokens
    re.compile(r"gh[pousr]_[A-Za-z0-9]{36}"),
    # Private-key header
    re.compile(r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"),
]

# PII patterns — detection only; not stripped in Phase 1
_PII_PATTERNS: list[re.Pattern] = [
    re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"),  # email
    re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),  # phone US
    re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),  # SSN
]

# Prompt-injection signals — patterns that suggest the model output is
# attempting to override instructions
_INJECTION_PATTERNS: list[re.Pattern] = [
    re.compile(r"(?i)ignore\s+(?:all\s+)?(?:previous\s+)?instructions?"),
    re.compile(r"(?i)disregard\s+(?:your\s+)?(?:system\s+)?prompt"),
    re.compile(
        r"(?i)you\s+are\s+now\s+(?:a\s+)?(?:different|new|another)\s+(?:ai|model|assistant)"
    ),
    re.compile(r"(?i)jailbreak"),
    re.compile(r"(?i)act\s+as\s+(?:an?\s+)?(?:unrestricted|unfiltered|uncensored)"),
]

_MAX_RESPONSE_CHARS = 32_000


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------


class SanitizeFlag(StrEnum):
    CREDENTIAL_LEAK = "credential_leak"
    PII_DETECTED = "pii_detected"
    INJECTION_SIGNAL = "injection_signal"
    SIZE_EXCEEDED = "size_exceeded"


@dataclass
class SanitizeResult:
    """Output from the sanitizer."""

    content: str
    flags: list[SanitizeFlag] = field(default_factory=list)
    blocked: bool = False
    block_reason: str | None = None

    @property
    def clean(self) -> bool:
        return not self.flags


class SanitizationError(Exception):
    """Raised when content is blocked outright."""


# ---------------------------------------------------------------------------
# Sanitizer
# ---------------------------------------------------------------------------


class SafetySanitizer:
    """Runs all safety checks on model output content.

    Call ``sanitize(content)`` — returns a ``SanitizeResult``.
    If ``result.blocked`` is True the content must not be forwarded.
    """

    def sanitize(self, content: str) -> SanitizeResult:
        flags: list[SanitizeFlag] = []
        blocked = False
        block_reason: str | None = None
        output = content

        # 1. Size cap — truncate but flag; don't block.
        if len(content) > _MAX_RESPONSE_CHARS:
            output = content[:_MAX_RESPONSE_CHARS]
            flags.append(SanitizeFlag.SIZE_EXCEEDED)

        # 2. Credential leak — block outright; do NOT surface to user.
        for pattern in _CREDENTIAL_PATTERNS:
            if pattern.search(output):
                blocked = True
                block_reason = "credential_leak_detected"
                flags.append(SanitizeFlag.CREDENTIAL_LEAK)
                break

        # 3. PII — flag only in Phase 1.
        for pattern in _PII_PATTERNS:
            if pattern.search(output):
                flags.append(SanitizeFlag.PII_DETECTED)
                break

        # 4. Injection signal — block if found in model output.
        for pattern in _INJECTION_PATTERNS:
            if pattern.search(output):
                blocked = True
                block_reason = "injection_signal_detected"
                flags.append(SanitizeFlag.INJECTION_SIGNAL)
                break

        return SanitizeResult(
            content=output,
            flags=flags,
            blocked=blocked,
            block_reason=block_reason,
        )
