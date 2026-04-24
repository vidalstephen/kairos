"""Tests for alias storage operations."""
from __future__ import annotations

import pytest

import kairos_vault.storage as storage


def test_store_and_resolve(tmp_data_dir: object) -> None:
    meta = storage.store(
        "kairos-github-token",
        "ghp_test000000000000",  # pragma: allowlist secret
        {"description": "GitHub PAT", "scope": "global", "rotation_interval_days": 90},
    )
    assert meta.alias == "kairos-github-token"
    assert meta.last_accessed is None

    value, access_id = storage.resolve("kairos-github-token")
    assert value == "ghp_test000000000000"  # pragma: allowlist secret
    assert len(access_id) == 36  # UUID4

    # last_accessed updated
    meta2 = storage.get_metadata("kairos-github-token")
    assert meta2.last_accessed is not None


def test_store_duplicate_raises(tmp_data_dir: object) -> None:
    storage.store("dup-alias", "val1", {"description": "d"})
    with pytest.raises(KeyError, match="already exists"):
        storage.store("dup-alias", "val2", {"description": "d"})


def test_resolve_unknown_raises(tmp_data_dir: object) -> None:
    with pytest.raises(KeyError, match="Unknown alias"):
        storage.resolve("no-such-alias")


def test_get_metadata(tmp_data_dir: object) -> None:
    storage.store("meta-test", "v", {"description": "Meta test", "scope": "workspace-x"})
    meta = storage.get_metadata("meta-test")
    assert meta.scope == "workspace-x"
    assert meta.rotation_interval_days == 90


def test_list_aliases_empty(tmp_data_dir: object) -> None:
    assert storage.list_aliases() == []


def test_list_aliases(tmp_data_dir: object) -> None:
    storage.store("a1", "v1", {"description": "A1"})
    storage.store("a2", "v2", {"description": "A2"})
    aliases = storage.list_aliases()
    assert {a.alias for a in aliases} == {"a1", "a2"}


def test_rotate(tmp_data_dir: object) -> None:
    storage.store("rotate-me", "old-value", {"description": "R"})
    meta = storage.rotate("rotate-me", new_value="new-value")
    assert meta.rotates_at != ""

    value, _ = storage.resolve("rotate-me")
    assert value == "new-value"


def test_rotate_generates_value_if_none(tmp_data_dir: object) -> None:
    storage.store("auto-rotate", "initial", {"description": "AR"})
    storage.rotate("auto-rotate", new_value=None)
    value, _ = storage.resolve("auto-rotate")
    # Generated value should be 64 hex chars (32 bytes)
    assert len(value) == 64
    assert value != "initial"


def test_rotate_unknown_raises(tmp_data_dir: object) -> None:
    with pytest.raises(KeyError, match="Unknown alias"):
        storage.rotate("ghost-alias")


def test_count(tmp_data_dir: object) -> None:
    assert storage.count() == 0
    storage.store("c1", "v", {"description": "C1"})
    assert storage.count() == 1
    storage.store("c2", "v", {"description": "C2"})
    assert storage.count() == 2


def test_alias_path_sanitization(tmp_data_dir: object) -> None:
    """Path traversal attempt is sanitized."""
    storage.store("../evil", "bad", {"description": "evil"})
    # Should not escape the values dir
    value, _ = storage.resolve("../evil")
    assert value == "bad"
