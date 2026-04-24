"""Tests for the context composer."""

from __future__ import annotations

from kairos_cognition.context.composer import ContextComposer, ContextRequest
from kairos_cognition.providers.base import Message, MessageRole


def _user_msg(text: str) -> Message:
    return Message(role=MessageRole.USER, content=text)


def _assistant_msg(text: str) -> Message:
    return Message(role=MessageRole.ASSISTANT, content=text)


class TestContextComposer:
    def _composer(self) -> ContextComposer:
        return ContextComposer()

    def test_compose_minimal(self) -> None:
        composer = self._composer()
        req = ContextRequest(session_id="s1", user_message="hello")
        messages = composer.compose(req)
        # At minimum: system + user
        assert len(messages) >= 2
        assert messages[0].role == MessageRole.SYSTEM
        assert messages[-1].role == MessageRole.USER
        assert messages[-1].content == "hello"

    def test_compose_with_persona(self) -> None:
        composer = self._composer()
        req = ContextRequest(
            session_id="s1",
            user_message="hello",
            persona="You are a helpful assistant named Kai.",
        )
        messages = composer.compose(req)
        assert "Kai" in messages[0].content

    def test_compose_with_workspace_id(self) -> None:
        composer = self._composer()
        req = ContextRequest(
            session_id="s1",
            user_message="hello",
            workspace_id="ws-123",
        )
        messages = composer.compose(req)
        assert "ws-123" in messages[0].content

    def test_compose_with_memory_fragments(self) -> None:
        composer = self._composer()
        req = ContextRequest(
            session_id="s1",
            user_message="what do you know about me?",
            memory_fragments=["User prefers dark mode", "User is a Python developer"],
        )
        messages = composer.compose(req)
        memory_msg = next(m for m in messages if "memory fragments" in m.content.lower())
        assert "dark mode" in memory_msg.content
        assert "Python developer" in memory_msg.content

    def test_compose_with_recent_messages(self) -> None:
        composer = self._composer()
        history = [_user_msg("first"), _assistant_msg("second"), _user_msg("third")]
        req = ContextRequest(
            session_id="s1",
            user_message="new message",
            recent_messages=history,
        )
        messages = composer.compose(req)
        contents = [m.content for m in messages]
        assert "first" in contents
        assert "new message" in contents

    def test_compose_caps_recent_messages(self) -> None:
        composer = self._composer()
        # 25 messages — should be capped at 20
        history = [_user_msg(f"msg {i}") for i in range(25)]
        req = ContextRequest(
            session_id="s1",
            user_message="latest",
            recent_messages=history,
        )
        messages = composer.compose(req)
        # system + (up to 20 history) + user → at most 22
        assert len(messages) <= 22

    def test_compose_with_task_brief(self) -> None:
        composer = self._composer()
        req = ContextRequest(
            session_id="s1",
            user_message="go",
            task_brief="Write a function that reverses a string.",
        )
        messages = composer.compose(req)
        assert "reverses a string" in messages[0].content

    def test_memory_truncated_when_too_long(self) -> None:
        composer = self._composer()
        # 5 000 chars — exceeds _MAX_MEMORY_CHARS of 4 000
        long_fragment = "x" * 5000
        req = ContextRequest(
            session_id="s1",
            user_message="hi",
            memory_fragments=[long_fragment],
        )
        messages = composer.compose(req)
        memory_msg = next(m for m in messages if "memory fragments" in m.content.lower())
        assert len(memory_msg.content) <= 4200  # some buffer for header
