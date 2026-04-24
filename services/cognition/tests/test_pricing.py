"""Tests for the static pricing table."""

from __future__ import annotations

from kairos_cognition.providers.pricing import (
    compute_cost,
    get_anthropic_pricing,
    get_openai_pricing,
    get_openrouter_pricing,
)


def test_anthropic_known_model() -> None:
    p = get_anthropic_pricing("claude-3-5-haiku")
    assert p.input_per_1k > 0
    assert p.output_per_1k > 0


def test_anthropic_unknown_model_returns_zero() -> None:
    p = get_anthropic_pricing("unknown-model-xyz")
    assert p.input_per_1k == 0.0
    assert p.output_per_1k == 0.0


def test_openai_known_model() -> None:
    p = get_openai_pricing("gpt-4o-mini")
    assert p.input_per_1k > 0
    assert p.output_per_1k > 0


def test_openrouter_known_model() -> None:
    p = get_openrouter_pricing("anthropic/claude-3-5-haiku")
    assert p.input_per_1k > 0


def test_compute_cost_zero_tokens() -> None:
    p = get_anthropic_pricing("claude-3-5-haiku")
    cost = compute_cost(p, 0, 0)
    assert cost == 0.0


def test_compute_cost_non_zero() -> None:
    p = get_openai_pricing("gpt-4o")
    cost = compute_cost(p, 1000, 500)
    expected = (1000 / 1000) * p.input_per_1k + (500 / 1000) * p.output_per_1k
    assert abs(cost - expected) < 1e-9
