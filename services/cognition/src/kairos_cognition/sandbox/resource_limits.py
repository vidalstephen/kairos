"""Resource limit configuration for sandboxed executors — Phase 1.10.

Applies OS-level resource limits inside the executor subprocess via
``preexec_fn`` (Unix only).  This constrains a rogue tool from consuming
unbounded CPU, memory, file descriptors, or spawning arbitrary child
processes.

Phase 1 defaults:

| Resource        | Limit          | Note                                  |
|-----------------|---------------|---------------------------------------|
| CPU time        | 30 s          | SIGXCPU on soft; SIGKILL on hard      |
| Address space   | 2 GiB         | RLIMIT_AS (includes stack, heap, mmap)|
| Max processes   | 32            | RLIMIT_NPROC (same uid)               |
| File descriptors| 64            | RLIMIT_NOFILE                         |

Phase 5 note: Docker executor containers enforce limits via ``--cpus``,
``--memory``, ``--pids-limit``, and ``--ulimit``; ``preexec_fn`` limits
serve as a defence-in-depth layer inside the container.
"""

from __future__ import annotations

import contextlib
import resource
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Callable

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


@dataclass
class ResourceLimitConfig:
    """Resource limits applied to sandboxed subprocess executors."""

    cpu_seconds: int = 30
    """Maximum CPU seconds before SIGXCPU (soft) and SIGKILL (hard)."""

    max_memory_bytes: int = 2 * 1024 * 1024 * 1024
    """Maximum virtual address space in bytes (RLIMIT_AS)."""

    max_pids: int = 32
    """Maximum number of simultaneous processes / threads (RLIMIT_NPROC)."""

    max_fds: int = 64
    """Maximum open file descriptors (RLIMIT_NOFILE)."""


DEFAULT_LIMITS = ResourceLimitConfig()


# ---------------------------------------------------------------------------
# preexec_fn factory
# ---------------------------------------------------------------------------


def get_preexec_fn(config: ResourceLimitConfig | None = None) -> Callable[[], None]:
    """Return a ``preexec_fn`` callable that applies *config* resource limits.

    Pass ``config=None`` to use :data:`DEFAULT_LIMITS`.

    The returned function is safe to use as the ``preexec_fn`` argument of
    ``asyncio.create_subprocess_shell`` and similar subprocess APIs.  Each
    ``setrlimit`` call is wrapped individually so that a failure on one limit
    (e.g. on a platform that does not support ``RLIMIT_NPROC``) does not
    prevent the remaining limits from being applied.
    """
    cfg = config or DEFAULT_LIMITS

    def _apply() -> None:  # executed in the child process before exec
        _try_setrlimit(resource.RLIMIT_CPU, cfg.cpu_seconds)
        _try_setrlimit(resource.RLIMIT_AS, cfg.max_memory_bytes)
        _try_setrlimit(resource.RLIMIT_NPROC, cfg.max_pids)
        _try_setrlimit(resource.RLIMIT_NOFILE, cfg.max_fds)

    return _apply


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _try_setrlimit(limit: int, value: int) -> None:
    """Apply a soft+hard RLIMIT, silently ignoring unsupported limits."""
    with contextlib.suppress(OSError, ValueError):
        resource.setrlimit(limit, (value, value))
