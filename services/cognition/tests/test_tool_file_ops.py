"""Tests for tools/file_ops.py."""

from __future__ import annotations

from typing import TYPE_CHECKING

from kairos_cognition.tools.file_ops import (
    _MAX_FILE_CHARS,
    FileListTool,
    FileReadTool,
    FileWriteTool,
)

if TYPE_CHECKING:
    import pytest

# ---------------------------------------------------------------------------
# FileReadTool
# ---------------------------------------------------------------------------


class TestFileReadTool:
    def _tool(self) -> FileReadTool:
        return FileReadTool()

    def test_manifest_name(self) -> None:
        assert self._tool().manifest.name == "file_read"

    def test_is_auto_approved(self) -> None:
        assert self._tool().is_auto_approved({"path": "/any"}) is True

    async def test_read_existing_file(self, tmp_path: pytest.TempPathFactory) -> None:
        p = tmp_path / "hello.txt"
        p.write_text("hello world")
        result = await self._tool().execute({"path": str(p)})
        assert result.success
        assert result.output == "hello world"
        assert not result.truncated

    async def test_read_missing_file(self, tmp_path: pytest.TempPathFactory) -> None:
        result = await self._tool().execute({"path": str(tmp_path / "missing.txt")})
        assert not result.success
        assert "not found" in (result.error or "")

    async def test_read_truncates_large_file(self, tmp_path: pytest.TempPathFactory) -> None:
        p = tmp_path / "big.txt"
        p.write_text("a" * (_MAX_FILE_CHARS + 100))
        result = await self._tool().execute({"path": str(p)})
        assert result.truncated
        assert "[truncated]" in result.output

    async def test_path_traversal_rejected(self) -> None:
        result = await self._tool().execute({"path": "/tmp/../etc/passwd"})
        assert not result.success
        assert "traversal" in (result.error or "")


# ---------------------------------------------------------------------------
# FileWriteTool
# ---------------------------------------------------------------------------


class TestFileWriteTool:
    def _tool(self) -> FileWriteTool:
        return FileWriteTool()

    def test_manifest_name(self) -> None:
        assert self._tool().manifest.name == "file_write"

    def test_is_not_auto_approved(self) -> None:
        assert self._tool().is_auto_approved({"path": "/any", "content": "x"}) is False

    async def test_write_creates_file(self, tmp_path: pytest.TempPathFactory) -> None:
        p = tmp_path / "out.txt"
        result = await self._tool().execute({"path": str(p), "content": "hello"})
        assert result.success
        assert p.read_text() == "hello"

    async def test_write_creates_parent_dirs(self, tmp_path: pytest.TempPathFactory) -> None:
        p = tmp_path / "a" / "b" / "c.txt"
        result = await self._tool().execute({"path": str(p), "content": "deep"})
        assert result.success
        assert p.read_text() == "deep"

    async def test_write_metadata_bytes_written(self, tmp_path: pytest.TempPathFactory) -> None:
        p = tmp_path / "meta.txt"
        content = "abc"
        result = await self._tool().execute({"path": str(p), "content": content})
        assert result.metadata["bytes_written"] == len(content.encode())

    async def test_path_traversal_rejected(self) -> None:
        result = await self._tool().execute({"path": "/tmp/../tmp/evil.txt", "content": "x"})
        assert not result.success
        assert "traversal" in (result.error or "")


# ---------------------------------------------------------------------------
# FileListTool
# ---------------------------------------------------------------------------


class TestFileListTool:
    def _tool(self) -> FileListTool:
        return FileListTool()

    def test_manifest_name(self) -> None:
        assert self._tool().manifest.name == "file_list"

    def test_is_auto_approved(self) -> None:
        assert self._tool().is_auto_approved({"path": "/tmp"}) is True

    async def test_list_dir(self, tmp_path: pytest.TempPathFactory) -> None:
        (tmp_path / "file.txt").write_text("x")
        (tmp_path / "subdir").mkdir()
        result = await self._tool().execute({"path": str(tmp_path)})
        assert result.success
        assert "file.txt" in result.output
        assert "subdir" in result.output

    async def test_list_missing_dir(self, tmp_path: pytest.TempPathFactory) -> None:
        result = await self._tool().execute({"path": str(tmp_path / "no_such_dir")})
        assert not result.success
        assert "not found" in (result.error or "")

    async def test_list_on_file_returns_error(self, tmp_path: pytest.TempPathFactory) -> None:
        p = tmp_path / "not_a_dir.txt"
        p.write_text("x")
        result = await self._tool().execute({"path": str(p)})
        assert not result.success

    async def test_path_traversal_rejected(self) -> None:
        result = await self._tool().execute({"path": "/tmp/../etc"})
        assert not result.success
        assert "traversal" in (result.error or "")

    async def test_metadata_has_entries(self, tmp_path: pytest.TempPathFactory) -> None:
        (tmp_path / "a.txt").write_text("x")
        result = await self._tool().execute({"path": str(tmp_path)})
        assert result.metadata["count"] >= 1
        assert isinstance(result.metadata["entries"], list)
