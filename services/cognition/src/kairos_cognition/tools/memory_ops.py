"""Memory operation tools — Phase 1.9.

Provides two Phase 1 stubs for memory access:

- :class:`MemoryRecallTool` — query the memory layer (stub; full retrieval in Phase 1.11).
- :class:`MemoryStoreTool`  — store an entry in memory (stub; full write path in Phase 1.11).

Both tools are fully typed and correctly registered in the tool registry.
The Phase 1.11 embedding + retrieval layer will replace the stub bodies while
keeping the public interface identical.
"""

from __future__ import annotations

import json
from typing import Any

import structlog

from kairos_cognition.tools.base import ToolManifest, ToolParam, ToolResult

log = structlog.get_logger(__name__)

_RECALL_MANIFEST = ToolManifest(
    name="memory_recall",
    version="1.0.0",
    description="Query the memory layer for relevant entries",
    params={
        "query": ToolParam(type="string", description="Natural language query", required=True),
        "scope": ToolParam(
            type="string",
            description="Memory scope: hot | warm | cold | global",
            required=False,
        ),
    },
    capabilities=("memory:read",),
    network_policy="none",
    blast_radius="read",
)

_STORE_MANIFEST = ToolManifest(
    name="memory_store",
    version="1.0.0",
    description="Store a new entry in the memory layer",
    params={
        "content": ToolParam(type="string", description="Text content to store", required=True),
        "scope": ToolParam(
            type="string",
            description="Memory scope: hot | warm | cold | global",
            required=False,
        ),
        "source_type": ToolParam(
            type="string",
            description="Origin of the memory (conversation | task | user_note)",
            required=False,
        ),
    },
    capabilities=("memory:write",),
    network_policy="none",
    blast_radius="write_local",
)


class MemoryRecallTool:
    """Phase 1 stub — returns an empty result set.

    The full pgvector + FTS hybrid retrieval path ships in Phase 1.11.
    """

    @property
    def manifest(self) -> ToolManifest:
        return _RECALL_MANIFEST

    def is_auto_approved(self, params: dict[str, Any]) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> ToolResult:
        query: str = params["query"]
        scope: str = params.get("scope", "hot")

        log.info("memory_recall.stub", query=query[:80], scope=scope)

        payload = json.dumps(
            {
                "fragments": [],
                "note": "Memory retrieval is not yet available (Phase 1.11). No results returned.",
            }
        )
        return ToolResult(
            tool="memory_recall",
            success=True,
            output=payload,
            metadata={"query": query, "scope": scope, "count": 0},
        )


class MemoryStoreTool:
    """Phase 1 stub — logs the intent and returns an acknowledged result.

    The full write path (PII check, approval routing, embedding, pgvector
    upsert) ships in Phase 1.11.
    """

    @property
    def manifest(self) -> ToolManifest:
        return _STORE_MANIFEST

    def is_auto_approved(self, params: dict[str, Any]) -> bool:
        return False  # memory writes require approval even in Phase 1

    async def execute(self, params: dict[str, Any]) -> ToolResult:
        content: str = params["content"]
        scope: str = params.get("scope", "hot")
        source_type: str = params.get("source_type", "conversation")

        log.info(
            "memory_store.stub",
            content_len=len(content),
            scope=scope,
            source_type=source_type,
        )

        return ToolResult(
            tool="memory_store",
            success=True,
            output="Memory store acknowledged (Phase 1 stub — entry not persisted until Phase 1.11).",
            metadata={"scope": scope, "source_type": source_type, "content_len": len(content)},
        )
