"""Tool registry — manifest validation and tool dispatch.

The registry is the single source of truth for which tools are available in
the cognition service.  It validates incoming params before handing off to the
tool implementation, keeping per-tool code free of boilerplate checks.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from kairos_cognition.tools.base import Tool, ToolManifest

# ---------------------------------------------------------------------------
# Validation result types
# ---------------------------------------------------------------------------


@dataclass
class ValidationError:
    field: str
    message: str


@dataclass
class ParamValidation:
    valid: bool
    errors: list[ValidationError]


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

_TYPE_MAP: dict[str, type] = {
    "string": str,
    "number": (int, float),  # type: ignore[dict-item]
    "boolean": bool,
}


class ToolRegistry:
    """In-memory registry that holds :class:`Tool` implementations."""

    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register(self, tool: Tool) -> None:
        """Add *tool* to the registry, keyed by ``manifest.name``."""
        self._tools[tool.manifest.name] = tool

    # ------------------------------------------------------------------
    # Lookup
    # ------------------------------------------------------------------

    def get(self, name: str) -> Tool | None:
        """Return the tool registered under *name*, or ``None``."""
        return self._tools.get(name)

    def list_names(self) -> list[str]:
        """Return sorted list of registered tool names."""
        return sorted(self._tools)

    def list_manifests(self) -> list[ToolManifest]:
        """Return manifests for all registered tools (sorted by name)."""
        return [t.manifest for t in sorted(self._tools.values(), key=lambda t: t.manifest.name)]

    # ------------------------------------------------------------------
    # Param validation
    # ------------------------------------------------------------------

    def validate_params(self, name: str, params: dict) -> ParamValidation:
        """Validate *params* against the manifest schema for *name*.

        Returns :class:`ParamValidation` with ``valid=False`` and populated
        ``errors`` if validation fails, or ``valid=True`` otherwise.
        If the tool is not registered, a single error is returned.
        """
        tool = self._tools.get(name)
        if tool is None:
            return ParamValidation(
                valid=False, errors=[ValidationError("tool", f"unknown tool: {name}")]
            )

        errors: list[ValidationError] = []
        manifest = tool.manifest

        for param_name, spec in manifest.params.items():
            if spec.required and param_name not in params:
                errors.append(ValidationError(param_name, "required param missing"))
                continue

            if param_name not in params:
                continue  # optional and absent — OK

            value = params[param_name]
            expected = _TYPE_MAP.get(spec.type)
            if expected is not None and not isinstance(value, expected):
                errors.append(
                    ValidationError(
                        param_name,
                        f"expected {spec.type}, got {type(value).__name__}",
                    )
                )

        # Flag extra params (not in manifest) — non-fatal warning only;
        # we do not reject extra params to stay forward-compatible.

        return ParamValidation(valid=len(errors) == 0, errors=errors)

    # ------------------------------------------------------------------
    # Auto-approve check
    # ------------------------------------------------------------------

    def is_auto_approved(self, name: str, params: dict) -> bool:
        """Return ``True`` if the tool call can bypass the approval workflow.

        Delegates to the tool's own ``is_auto_approved`` implementation.
        Returns ``False`` for unknown tools.
        """
        tool = self._tools.get(name)
        if tool is None:
            return False
        return tool.is_auto_approved(params)


# ---------------------------------------------------------------------------
# Default registry factory
# ---------------------------------------------------------------------------


def build_default_registry() -> ToolRegistry:
    """Create and return a :class:`ToolRegistry` populated with all Phase 1.9
    tools: shell_exec, file_read, file_write, file_list, memory_recall,
    memory_store.
    """
    # Import here to avoid circular imports at module load time.
    from kairos_cognition.tools.file_ops import FileListTool, FileReadTool, FileWriteTool
    from kairos_cognition.tools.memory_ops import MemoryRecallTool, MemoryStoreTool
    from kairos_cognition.tools.shell_exec import ShellExecTool

    registry = ToolRegistry()
    for tool in [
        ShellExecTool(),
        FileReadTool(),
        FileWriteTool(),
        FileListTool(),
        MemoryRecallTool(),
        MemoryStoreTool(),
    ]:
        registry.register(tool)
    return registry
