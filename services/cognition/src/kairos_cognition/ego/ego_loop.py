"""Ego main-loop scaffold — Phase 1 (single stratum, observe → plan → act).

The full Ego runtime (multi-stratum routing, proactive loop, self-state
persistence) is built out in Phase 2.  This scaffold establishes the
observe/plan/act skeleton and the public interface consumed by the run
engine and the context composer.

Behaviour:
- OBSERVE  — build context window from composer
- PLAN     — send to model via router; parse routing decision
- ACT      — return plan result (tool dispatch deferred to Phase 1.9)

The loop holds a per-session mutex so only one pass runs at a time per
session, matching the ego-runtime spec concurrency constraint.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import structlog

from kairos_cognition.context.composer import ContextComposer, ContextRequest
from kairos_cognition.router.model_router import ModelRouter, RouteRequest

if TYPE_CHECKING:
    from kairos_cognition.providers.base import Message

log = structlog.get_logger(__name__)

_EGO_MODEL = "claude-3-5-haiku"
_EGO_SYSTEM_PROMPT = """\
You are Kairos — an intelligent assistant with access to tools and memory.
You think carefully, act precisely, and surface your reasoning when useful.
Always respond in the user's language and frame work within the workspace context.

For each user message, decide:
1. Can you answer directly? → respond.
2. Does this need a specialist (coder, researcher, browser, etc.)? → output a routing directive.
3. Does this need a tool call? → output a tool call directive.

Routing directive format (JSON, single line):
{"route": "<role>", "brief": "<task brief>"}

Keep your response concise and helpful.
"""


@dataclass
class EgoPass:
    """Input to a single Ego pass."""

    session_id: str
    run_id: str
    user_message: str
    workspace_id: str | None = None
    recent_messages: list[Message] = field(default_factory=list)
    memory_fragments: list[str] = field(default_factory=list)
    persona: str | None = None
    workspace_role_models: dict[str, str] = field(default_factory=dict)
    workspace_default_model: str | None = None


@dataclass
class EgoPassResult:
    """Output of a single Ego pass."""

    run_id: str
    response: str
    # Populated when the Ego decides to route to a specialist
    route_role: str | None = None
    route_brief: str | None = None
    tokens_in: int = 0
    tokens_out: int = 0
    cost_usd: float = 0.0
    finished_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class EgoLoop:
    """Single-stratum Ego loop.

    In Phase 1 the loop performs one observe→plan→act pass and returns
    the result.  Proactive scheduling, multi-stratum dispatch, and
    self-state persistence are Phase 2+ concerns.
    """

    def __init__(self, router: ModelRouter, composer: ContextComposer) -> None:
        self._router = router
        self._composer = composer
        # Per-session mutex: maps session_id → asyncio.Lock
        self._locks: dict[str, asyncio.Lock] = {}

    def _get_lock(self, session_id: str) -> asyncio.Lock:
        if session_id not in self._locks:
            self._locks[session_id] = asyncio.Lock()
        return self._locks[session_id]

    async def run_pass(self, ego_pass: EgoPass) -> EgoPassResult:
        """Execute one observe → plan → act cycle."""
        lock = self._get_lock(ego_pass.session_id)
        async with lock:
            return await self._run_pass_locked(ego_pass)

    async def _run_pass_locked(self, ego_pass: EgoPass) -> EgoPassResult:
        log.debug(
            "ego.pass_start",
            session_id=ego_pass.session_id,
            run_id=ego_pass.run_id,
        )

        # ------------------------------------------------------------------
        # OBSERVE — build context window
        # ------------------------------------------------------------------
        context_req = ContextRequest(
            session_id=ego_pass.session_id,
            user_message=ego_pass.user_message,
            recent_messages=ego_pass.recent_messages,
            memory_fragments=ego_pass.memory_fragments,
            persona=ego_pass.persona,
            workspace_id=ego_pass.workspace_id,
        )
        messages = self._composer.compose(context_req)

        # ------------------------------------------------------------------
        # PLAN — call model
        # ------------------------------------------------------------------
        route_req = RouteRequest(
            messages=messages,
            agent_role="ego",
            workspace_role_models=ego_pass.workspace_role_models,
            workspace_default_model=ego_pass.workspace_default_model,
            max_tokens=200,  # ego pass budget per spec
            temperature=1.0,
        )
        completion = await self._router.complete(route_req)
        log.debug(
            "ego.pass_complete",
            run_id=ego_pass.run_id,
            tokens_in=completion.tokens_in,
            tokens_out=completion.tokens_out,
        )

        # ------------------------------------------------------------------
        # ACT — parse routing directive (if any)
        # ------------------------------------------------------------------
        route_role, route_brief = _parse_routing_directive(completion.content)

        return EgoPassResult(
            run_id=ego_pass.run_id,
            response=completion.content,
            route_role=route_role,
            route_brief=route_brief,
            tokens_in=completion.tokens_in,
            tokens_out=completion.tokens_out,
            cost_usd=completion.cost_usd,
        )


def _parse_routing_directive(content: str) -> tuple[str | None, str | None]:
    """Extract routing directive from response if present."""
    import json
    import re

    # Look for {"route": "...", "brief": "..."} anywhere in the content.
    match = re.search(r'\{"route"\s*:\s*"([^"]+)"[^}]*"brief"\s*:\s*"([^"]+)"\}', content)
    if match:
        return match.group(1), match.group(2)

    # Try full JSON parse in case the model returned only JSON.
    stripped = content.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        try:
            obj = json.loads(stripped)
            if isinstance(obj, dict) and "route" in obj and "brief" in obj:
                return str(obj["route"]), str(obj["brief"])
        except json.JSONDecodeError:
            pass

    return None, None
