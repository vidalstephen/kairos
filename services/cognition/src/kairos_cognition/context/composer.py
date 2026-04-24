"""Context composer.

Builds the ordered message list sent to a model from:
  - System prompt (persona + workspace framing)
  - Recent conversation history (last N messages)
  - Retrieved memory fragments (injected as system-role context)
  - Current user message

Follows the context injection rules from docs/specs/ego-runtime.md:
task models receive only what they need; the full self-state document,
goal register, and persona definition are NOT forwarded to task models.
The composer is called for Ego passes; task-model briefing is a separate
concern (Phase 2+).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from kairos_cognition.providers.base import Message, MessageRole

_EGO_SYSTEM_BASE = (
    "You are Kairos — an intelligent assistant. "
    "Think carefully, act precisely, and surface your reasoning when useful."
)

_MEMORY_HEADER = "## Relevant memory fragments\n"

_MAX_RECENT_MESSAGES = 20
_MAX_MEMORY_CHARS = 4000


@dataclass
class ContextRequest:
    """All inputs needed to compose a context window."""

    session_id: str
    user_message: str
    recent_messages: list[Message] = field(default_factory=list)
    memory_fragments: list[str] = field(default_factory=list)
    persona: str | None = None
    workspace_id: str | None = None
    # For task-model briefing (Phase 2): these override the ego system prompt
    task_brief: str | None = None
    allowed_tool_schemas: list[dict] | None = None


class ContextComposer:
    """Assembles a message list from a ContextRequest."""

    def compose(self, request: ContextRequest) -> list[Message]:
        """Return the ordered list of messages for the model."""
        messages: list[Message] = []

        # 1. System prompt
        system_content = self._build_system(request)
        messages.append(Message(role=MessageRole.SYSTEM, content=system_content))

        # 2. Memory fragments (injected before conversation history so they
        #    appear as context rather than conversation turns)
        if request.memory_fragments:
            memory_block = _MEMORY_HEADER + "\n".join(f"- {f}" for f in request.memory_fragments)
            # Truncate to budget
            if len(memory_block) > _MAX_MEMORY_CHARS:
                memory_block = memory_block[:_MAX_MEMORY_CHARS] + "\n[truncated]"
            messages.append(Message(role=MessageRole.SYSTEM, content=memory_block))

        # 3. Recent conversation history (capped at _MAX_RECENT_MESSAGES)
        recent = request.recent_messages[-_MAX_RECENT_MESSAGES:]
        messages.extend(recent)

        # 4. Current user message
        messages.append(Message(role=MessageRole.USER, content=request.user_message))

        return messages

    def _build_system(self, request: ContextRequest) -> str:
        parts: list[str] = []

        if request.task_brief:
            # Task-model briefing: concise task description only.
            parts.append(request.task_brief)
        else:
            # Ego pass: persona + base instructions.
            if request.persona:
                parts.append(request.persona)
            else:
                parts.append(_EGO_SYSTEM_BASE)

        if request.workspace_id:
            parts.append(f"Workspace: {request.workspace_id}")

        return "\n\n".join(parts)
