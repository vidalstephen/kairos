"""Tests for the re-voicing pipeline."""

from __future__ import annotations

from kairos_cognition.revoice.pipeline import RevoicePipeline, RevoiceRequest


class TestRevoicePipeline:
    def _pipeline(self) -> RevoicePipeline:
        return RevoicePipeline()

    def _req(self, content: str) -> RevoiceRequest:
        return RevoiceRequest(content=content, run_id="run-1", session_id="sess-1")

    def test_clean_content_passthrough(self) -> None:
        result = self._pipeline().process(self._req("Here is your answer."))
        assert result.content == "Here is your answer."
        assert not result.artifacts_stripped
        assert not result.revoiced

    def test_strips_thinking_block(self) -> None:
        content = "<thinking>internal reasoning here</thinking>\nActual response."
        result = self._pipeline().process(self._req(content))
        assert "<thinking>" not in result.content
        assert "Actual response." in result.content
        assert result.artifacts_stripped

    def test_strips_tool_result_block(self) -> None:
        content = "<tool_result>raw output</tool_result>\nHere is the result."
        result = self._pipeline().process(self._req(content))
        assert "<tool_result>" not in result.content
        assert result.artifacts_stripped

    def test_strips_function_results_block(self) -> None:
        content = "<function_results>data</function_results>\nDone."
        result = self._pipeline().process(self._req(content))
        assert "<function_results>" not in result.content
        assert result.artifacts_stripped

    def test_strips_persona_leakage(self) -> None:
        content = "I am Claude, an AI language model by Anthropic.\nHere is your answer."
        result = self._pipeline().process(self._req(content))
        # Persona leakage line should be removed
        assert "I am Claude" not in result.content

    def test_empty_content_passthrough(self) -> None:
        result = self._pipeline().process(self._req(""))
        assert result.content == ""
        assert not result.artifacts_stripped

    def test_run_id_preserved(self) -> None:
        req = RevoiceRequest(content="hi", run_id="run-abc", session_id="s-1")
        result = self._pipeline().process(req)
        assert result.run_id == "run-abc"
