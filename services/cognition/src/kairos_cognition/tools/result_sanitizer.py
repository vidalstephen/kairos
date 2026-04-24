"""Tool result sanitizer — Phase 1.9.

Sanitizes the raw output of a tool call before it is passed back to the model
or surfaced to the user.  Unlike the model output sanitizer (which blocks on
credential detection), tool results are *redacted in place* — the model needs
to know the result was obtained, but should never see the raw secret.

Rules applied in order:
1. **Size cap** — truncate at :data:`_MAX_RESULT_CHARS`.
2. **Credential redaction** — replace matched secrets with ``[REDACTED]``.
3. **PII detection** — flag only (not stripped in Phase 1).

The sanitizer does NOT block tool results; it only redacts and flags.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import StrEnum

# ---------------------------------------------------------------------------
# Constants & patterns
# ---------------------------------------------------------------------------

_MAX_RESULT_CHARS: int = 16_000

# Reuse the same patterns from the model output sanitizer, but here they drive
# *redaction* instead of blocking.
_CREDENTIAL_PATTERNS: list[re.Pattern] = [
    re.compile(
        r"(?i)(api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token"
        r"|bearer\s+[A-Za-z0-9\-._~+/]+=*"
        r"|password)\s*[=:]\s*['\"]?([A-Za-z0-9+/=\-_.]{16,})['\"]?",
    ),
    re.compile(r"(?<![A-Z0-9])(AKIA|AGPA|AROA|AIPA|ANPA|ANVA|ASIA)([A-Z0-9]{16})"),
    re.compile(r"(gh[pousr]_[A-Za-z0-9]{36})"),
    re.compile(r"(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)"),
]

_PII_PATTERNS: list[re.Pattern] = [
    re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"),  # email
    re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),  # US phone
    re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),  # SSN
]


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


class ResultFlag(StrEnum):
    CREDENTIAL_REDACTED = "CREDENTIAL_REDACTED"
    PII_DETECTED = "PII_DETECTED"
    SIZE_TRUNCATED = "SIZE_TRUNCATED"


@dataclass
class SanitizedResult:
    output: str
    flags: list[ResultFlag] = field(default_factory=list)
    was_truncated: bool = False


# ---------------------------------------------------------------------------
# Sanitizer
# ---------------------------------------------------------------------------


class ToolResultSanitizer:
    """Sanitize raw tool output before forwarding to the model."""

    def sanitize(self, output: str) -> SanitizedResult:
        flags: list[ResultFlag] = []
        was_truncated = False

        # 1. Size cap
        if len(output) > _MAX_RESULT_CHARS:
            output = output[:_MAX_RESULT_CHARS] + "\n… [truncated]"
            was_truncated = True
            flags.append(ResultFlag.SIZE_TRUNCATED)

        # 2. Credential redaction
        redacted = output
        for pat in _CREDENTIAL_PATTERNS:
            new = pat.sub("[REDACTED]", redacted)
            if new != redacted:
                flags.append(ResultFlag.CREDENTIAL_REDACTED)
                redacted = new
        output = redacted

        # 3. PII detection (flag only)
        for pat in _PII_PATTERNS:
            if pat.search(output):
                flags.append(ResultFlag.PII_DETECTED)
                break  # one flag is sufficient

        # Deduplicate flags while preserving order
        seen: set[ResultFlag] = set()
        unique_flags: list[ResultFlag] = []
        for f in flags:
            if f not in seen:
                seen.add(f)
                unique_flags.append(f)

        return SanitizedResult(output=output, flags=unique_flags, was_truncated=was_truncated)
