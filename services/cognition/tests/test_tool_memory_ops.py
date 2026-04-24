"""Tests for tools/memory_ops.py."""

from __future__ import annotations

import json

from kairos_cognition.tools.memory_ops import MemoryRecallTool, MemoryStoreTool

# ---------------------------------------------------------------------------
# MemoryRecallTool
# ---------------------------------------------------------------------------


class TestMemoryRecallTool:
    def _tool(self) -> MemoryRecallTool:
        return MemoryRecallTool()

    def test_manifest_name(self) -> None:
        assert self._tool().manifest.name == "memory_recall"

    def test_is_auto_approved(self) -> None:
        assert self._tool().is_auto_approved({"query": "anything"}) is True

    async def test_execute_returns_success(self) -> None:
        result = await self._tool().execute({"query": "test query"})
        assert result.success

    async def test_execute_output_is_valid_json(self) -> None:
        result = await self._tool().execute({"query": "test"})
        payload = json.loads(result.output)
        assert "fragments" in payload
        assert isinstance(payload["fragments"], list)

    async def test_execute_empty_fragments_in_phase1(self) -> None:
        result = await self._tool().execute({"query": "anything"})
        payload = json.loads(result.output)
        assert payload["fragments"] == []

    async def test_execute_metadata_has_count_zero(self) -> None:
        result = await self._tool().execute({"query": "q", "scope": "warm"})
        assert result.metadata["count"] == 0

    async def test_execute_scope_in_metadata(self) -> None:
        result = await self._tool().execute({"query": "q", "scope": "cold"})
        assert result.metadata["scope"] == "cold"

    async def test_execute_default_scope_hot(self) -> None:
        result = await self._tool().execute({"query": "q"})
        assert result.metadata["scope"] == "hot"


# ---------------------------------------------------------------------------
# MemoryStoreTool
# ---------------------------------------------------------------------------


class TestMemoryStoreTool:
    def _tool(self) -> MemoryStoreTool:
        return MemoryStoreTool()

    def test_manifest_name(self) -> None:
        assert self._tool().manifest.name == "memory_store"

    def test_is_not_auto_approved(self) -> None:
        assert self._tool().is_auto_approved({"content": "x"}) is False

    async def test_execute_returns_success(self) -> None:
        result = await self._tool().execute({"content": "remember this", "scope": "hot"})
        assert result.success

    async def test_execute_metadata_has_content_len(self) -> None:
        content = "test content"
        result = await self._tool().execute({"content": content})
        assert result.metadata["content_len"] == len(content)

    async def test_execute_default_source_type_conversation(self) -> None:
        result = await self._tool().execute({"content": "x"})
        assert result.metadata["source_type"] == "conversation"

    async def test_execute_custom_source_type(self) -> None:
        result = await self._tool().execute({"content": "x", "source_type": "task"})
        assert result.metadata["source_type"] == "task"
