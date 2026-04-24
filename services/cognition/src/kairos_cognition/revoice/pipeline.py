"""Re-voicing pipeline scaffold.

Phase 1 behaviour: passthrough with artifact stripping.
Full enforcement (persona re-voicing via Stratum 1 Ego call) is Phase 2+.

Per docs/specs/ego-runtime.md Output Re-Voicing Pipeline:
  1. RECEIVE task result
  2. EVALUATE structural correctness  (stub: always passes in Phase 1)
  3. STRIP task-model artifacts (thinking blocks, raw tool output, persona leakage)
  4. FRAME with session context  (stub: passthrough in Phase 1)
  5. RE-VOICE in persona          (stub: passthrough in Phase 1)
  6. ADD links / attribution     (stub: passthrough in Phase 1)
  7. DELIVER                      (caller's responsibility)
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# ---------------------------------------------------------------------------
# Artifact patterns to strip from task-model output
# ---------------------------------------------------------------------------

# Anthropic extended thinking blocks: <thinking>...</thinking>
_THINKING_BLOCK = re.compile(r"<thinking>.*?</thinking>", re.DOTALL | re.IGNORECASE)

# Internal tool-output wrappers that Claude sometimes surfaces
_TOOL_RESULT_BLOCK = re.compile(r"<tool_result>.*?</tool_result>", re.DOTALL | re.IGNORECASE)
_FUNCTION_RESULT_BLOCK = re.compile(
    r"<function_results>.*?</function_results>", re.DOTALL | re.IGNORECASE
)

# Task-model persona leakage: lines starting with "I am [ModelName]" or
# "As [ModelName]" that indicate the model breaking character
_PERSONA_LEAKAGE = re.compile(
    r"^(I am|As) (GPT|Claude|Gemini|an AI language model)[^.\n]*[.!\n]",
    re.MULTILINE | re.IGNORECASE,
)


def _strip_artifacts(content: str) -> str:
    """Remove thinking blocks, raw tool outputs, and persona leakage."""
    content = _THINKING_BLOCK.sub("", content)
    content = _TOOL_RESULT_BLOCK.sub("", content)
    content = _FUNCTION_RESULT_BLOCK.sub("", content)
    content = _PERSONA_LEAKAGE.sub("", content)
    return content.strip()


# ---------------------------------------------------------------------------
# Pipeline data types
# ---------------------------------------------------------------------------


@dataclass
class RevoiceRequest:
    """Input to the re-voicing pipeline."""

    content: str
    run_id: str
    session_id: str
    # Phase 2: persona will be used for actual re-voicing
    persona: str | None = None


@dataclass
class RevoiceResult:
    """Output from the re-voicing pipeline."""

    content: str
    run_id: str
    artifacts_stripped: bool = False
    # Phase 2: will be True when a full Ego re-voice call was made
    revoiced: bool = False


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


class RevoicePipeline:
    """Phase 1 re-voicing pipeline — passthrough with artifact stripping.

    In Phase 2 this will optionally make a short Ego call to re-voice
    longer outputs in the current persona.
    """

    def process(self, request: RevoiceRequest) -> RevoiceResult:
        """Run the pipeline synchronously (Phase 1: no LLM call needed)."""
        # Step 3: strip artifacts
        stripped = _strip_artifacts(request.content)
        artifacts_stripped = stripped != request.content

        # Steps 4-6: passthrough in Phase 1
        return RevoiceResult(
            content=stripped,
            run_id=request.run_id,
            artifacts_stripped=artifacts_stripped,
            revoiced=False,
        )
