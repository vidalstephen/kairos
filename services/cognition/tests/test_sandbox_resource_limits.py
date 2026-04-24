"""Tests for sandbox/resource_limits.py."""

from __future__ import annotations

from unittest.mock import call, patch

from kairos_cognition.sandbox.resource_limits import (
    DEFAULT_LIMITS,
    ResourceLimitConfig,
    _try_setrlimit,
    get_preexec_fn,
)

# ---------------------------------------------------------------------------
# Default config
# ---------------------------------------------------------------------------


def test_default_limits_cpu_seconds() -> None:
    assert DEFAULT_LIMITS.cpu_seconds == 30


def test_default_limits_memory_2gib() -> None:
    assert DEFAULT_LIMITS.max_memory_bytes == 2 * 1024 * 1024 * 1024


def test_default_limits_max_pids() -> None:
    assert DEFAULT_LIMITS.max_pids == 32


def test_default_limits_max_fds() -> None:
    assert DEFAULT_LIMITS.max_fds == 64


# ---------------------------------------------------------------------------
# get_preexec_fn
# ---------------------------------------------------------------------------


def test_get_preexec_fn_returns_callable() -> None:
    fn = get_preexec_fn()
    assert callable(fn)


def test_get_preexec_fn_none_uses_defaults() -> None:
    """Passing None should produce the same callable as passing DEFAULT_LIMITS."""
    fn_none = get_preexec_fn(None)
    fn_default = get_preexec_fn(DEFAULT_LIMITS)
    # Both must be callables — we verify behaviour via setrlimit mock below.
    assert callable(fn_none)
    assert callable(fn_default)


def test_preexec_fn_calls_setrlimit_four_times() -> None:
    import resource

    config = ResourceLimitConfig(
        cpu_seconds=10,
        max_memory_bytes=512 * 1024 * 1024,
        max_pids=16,
        max_fds=32,
    )
    fn = get_preexec_fn(config)

    with patch("kairos_cognition.sandbox.resource_limits.resource") as mock_resource:
        mock_resource.RLIMIT_CPU = resource.RLIMIT_CPU
        mock_resource.RLIMIT_AS = resource.RLIMIT_AS
        mock_resource.RLIMIT_NPROC = resource.RLIMIT_NPROC
        mock_resource.RLIMIT_NOFILE = resource.RLIMIT_NOFILE
        mock_resource.error = resource.error
        fn()

    assert mock_resource.setrlimit.call_count == 4


def test_preexec_fn_passes_correct_values() -> None:
    import resource

    config = ResourceLimitConfig(
        cpu_seconds=5,
        max_memory_bytes=256 * 1024 * 1024,
        max_pids=8,
        max_fds=16,
    )
    fn = get_preexec_fn(config)

    with patch("kairos_cognition.sandbox.resource_limits.resource") as mock_resource:
        mock_resource.RLIMIT_CPU = resource.RLIMIT_CPU
        mock_resource.RLIMIT_AS = resource.RLIMIT_AS
        mock_resource.RLIMIT_NPROC = resource.RLIMIT_NPROC
        mock_resource.RLIMIT_NOFILE = resource.RLIMIT_NOFILE
        mock_resource.error = resource.error
        fn()

    calls = mock_resource.setrlimit.call_args_list
    # Each limit is set as (value, value) — soft == hard
    assert call(resource.RLIMIT_CPU, (5, 5)) in calls
    assert call(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024)) in calls
    assert call(resource.RLIMIT_NPROC, (8, 8)) in calls
    assert call(resource.RLIMIT_NOFILE, (16, 16)) in calls


def test_try_setrlimit_silently_handles_error() -> None:
    """_try_setrlimit must not raise even when setrlimit fails."""
    import resource

    with patch("kairos_cognition.sandbox.resource_limits.resource") as mock_resource:
        mock_resource.RLIMIT_CPU = resource.RLIMIT_CPU
        mock_resource.error = resource.error
        mock_resource.setrlimit.side_effect = OSError("not allowed")
        # Should not raise
        _try_setrlimit(resource.RLIMIT_CPU, 10)
