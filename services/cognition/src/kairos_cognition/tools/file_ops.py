"""File operation tools — Phase 1.9.

Provides three tools that operate on the local file system:

- :class:`FileReadTool` — read the contents of a file.
- :class:`FileWriteTool` — write content to a file (creates parents if missing).
- :class:`FileListTool`  — list the immediate children of a directory.

Path traversal guard: any path containing ``..`` is rejected to prevent
accidental escaping of the intended workspace root.

Phase 1 note: these tools run directly without the Phase 1.10 sandbox.
"""

from __future__ import annotations

import os
import stat
from typing import Any

from kairos_cognition.tools.base import ToolManifest, ToolParam, ToolResult

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_MAX_FILE_CHARS: int = 32_000  # cap for file_read output
_MAX_LIST_ENTRIES: int = 1_000  # cap for file_list results


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _reject_traversal(path: str, tool: str) -> ToolResult | None:
    """Return an error ToolResult if *path* contains ``..``, else ``None``."""
    if ".." in path.split(os.sep) or ".." in path.split("/"):
        return ToolResult(
            tool=tool,
            success=False,
            output="",
            error="path traversal ('..') is not permitted",
        )
    return None


# ---------------------------------------------------------------------------
# file_read
# ---------------------------------------------------------------------------

_FILE_READ_MANIFEST = ToolManifest(
    name="file_read",
    version="1.0.0",
    description="Read the contents of a file from the workspace",
    params={
        "path": ToolParam(
            type="string", description="Absolute or relative path to the file", required=True
        ),
    },
    capabilities=("fs:read",),
    network_policy="none",
    blast_radius="read",
)


class FileReadTool:
    @property
    def manifest(self) -> ToolManifest:
        return _FILE_READ_MANIFEST

    def is_auto_approved(self, params: dict[str, Any]) -> bool:
        return True  # reads are always auto-approved

    async def execute(self, params: dict[str, Any]) -> ToolResult:
        path: str = params["path"]

        if err := _reject_traversal(path, "file_read"):
            return err

        try:
            with open(path, encoding="utf-8", errors="replace") as fh:
                content = fh.read()
        except FileNotFoundError:
            return ToolResult(
                tool="file_read", success=False, output="", error=f"file not found: {path}"
            )
        except PermissionError:
            return ToolResult(
                tool="file_read", success=False, output="", error=f"permission denied: {path}"
            )
        except OSError as exc:
            return ToolResult(tool="file_read", success=False, output="", error=str(exc))

        truncated = len(content) > _MAX_FILE_CHARS
        if truncated:
            content = content[:_MAX_FILE_CHARS] + "\n… [truncated]"

        return ToolResult(
            tool="file_read",
            success=True,
            output=content,
            truncated=truncated,
            metadata={"path": path},
        )


# ---------------------------------------------------------------------------
# file_write
# ---------------------------------------------------------------------------

_FILE_WRITE_MANIFEST = ToolManifest(
    name="file_write",
    version="1.0.0",
    description="Write content to a file in the workspace",
    params={
        "path": ToolParam(type="string", description="Path to write to", required=True),
        "content": ToolParam(type="string", description="Content to write", required=True),
    },
    capabilities=("fs:write",),
    network_policy="none",
    blast_radius="write_local",
)


class FileWriteTool:
    @property
    def manifest(self) -> ToolManifest:
        return _FILE_WRITE_MANIFEST

    def is_auto_approved(self, params: dict[str, Any]) -> bool:
        return False  # writes require approval

    async def execute(self, params: dict[str, Any]) -> ToolResult:
        path: str = params["path"]
        content: str = params["content"]

        if err := _reject_traversal(path, "file_write"):
            return err

        try:
            parent = os.path.dirname(path)
            if parent:
                os.makedirs(parent, exist_ok=True)
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(content)
        except PermissionError:
            return ToolResult(
                tool="file_write", success=False, output="", error=f"permission denied: {path}"
            )
        except OSError as exc:
            return ToolResult(tool="file_write", success=False, output="", error=str(exc))

        return ToolResult(
            tool="file_write",
            success=True,
            output=f"wrote {len(content)} bytes to {path}",
            metadata={"path": path, "bytes_written": len(content.encode())},
        )


# ---------------------------------------------------------------------------
# file_list
# ---------------------------------------------------------------------------

_FILE_LIST_MANIFEST = ToolManifest(
    name="file_list",
    version="1.0.0",
    description="List files in a directory",
    params={
        "path": ToolParam(type="string", description="Directory path to list", required=True),
    },
    capabilities=("fs:read",),
    network_policy="none",
    blast_radius="read",
)


def _entry_info(dir_path: str, name: str) -> dict:
    full = os.path.join(dir_path, name)
    try:
        st = os.stat(full)
        is_dir = stat.S_ISDIR(st.st_mode)
        return {
            "name": name,
            "type": "directory" if is_dir else "file",
            "size": st.st_size,
            "mtime": int(st.st_mtime),
        }
    except OSError:
        return {"name": name, "type": "unknown", "size": 0, "mtime": 0}


class FileListTool:
    @property
    def manifest(self) -> ToolManifest:
        return _FILE_LIST_MANIFEST

    def is_auto_approved(self, params: dict[str, Any]) -> bool:
        return True  # listing is always auto-approved

    async def execute(self, params: dict[str, Any]) -> ToolResult:
        path: str = params["path"]

        if err := _reject_traversal(path, "file_list"):
            return err

        try:
            entries = os.listdir(path)
        except FileNotFoundError:
            return ToolResult(
                tool="file_list", success=False, output="", error=f"directory not found: {path}"
            )
        except NotADirectoryError:
            return ToolResult(
                tool="file_list", success=False, output="", error=f"not a directory: {path}"
            )
        except PermissionError:
            return ToolResult(
                tool="file_list", success=False, output="", error=f"permission denied: {path}"
            )

        entries = sorted(entries)
        truncated = len(entries) > _MAX_LIST_ENTRIES
        if truncated:
            entries = entries[:_MAX_LIST_ENTRIES]

        infos = [_entry_info(path, name) for name in entries]

        # Format as a simple text listing for the model
        lines = [f"{'d' if e['type'] == 'directory' else '-'}  {e['name']}" for e in infos]
        output = "\n".join(lines)

        return ToolResult(
            tool="file_list",
            success=True,
            output=output,
            truncated=truncated,
            metadata={"path": path, "count": len(infos), "entries": infos},
        )
