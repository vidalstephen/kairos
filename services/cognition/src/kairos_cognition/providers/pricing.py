"""Static pricing table (updated quarterly).

Prices are per 1 000 tokens in USD.
"""

from __future__ import annotations

from kairos_cognition.providers.base import Pricing

# ---------------------------------------------------------------------------
# Anthropic
# ---------------------------------------------------------------------------
_ANTHROPIC: dict[str, Pricing] = {
    "claude-3-5-haiku": Pricing(input_per_1k=0.0008, output_per_1k=0.004),
    "claude-3-7-sonnet": Pricing(input_per_1k=0.003, output_per_1k=0.015),
    "claude-3-opus": Pricing(input_per_1k=0.015, output_per_1k=0.075),
    # aliases
    "claude-3-5-haiku-20241022": Pricing(input_per_1k=0.0008, output_per_1k=0.004),
    "claude-3-7-sonnet-20250219": Pricing(input_per_1k=0.003, output_per_1k=0.015),
}

# ---------------------------------------------------------------------------
# OpenAI
# ---------------------------------------------------------------------------
_OPENAI: dict[str, Pricing] = {
    "gpt-4o": Pricing(input_per_1k=0.005, output_per_1k=0.015),
    "gpt-4o-mini": Pricing(input_per_1k=0.00015, output_per_1k=0.0006),
    "gpt-4-turbo": Pricing(input_per_1k=0.01, output_per_1k=0.03),
    "text-embedding-3-small": Pricing(input_per_1k=0.00002, output_per_1k=0.0),
}

# ---------------------------------------------------------------------------
# OpenRouter (prefix stripped for lookup)
# ---------------------------------------------------------------------------
_OPENROUTER: dict[str, Pricing] = {
    "anthropic/claude-3-5-haiku": Pricing(input_per_1k=0.001, output_per_1k=0.005),
    "anthropic/claude-3-7-sonnet": Pricing(input_per_1k=0.004, output_per_1k=0.02),
    "openai/gpt-4-turbo": Pricing(input_per_1k=0.012, output_per_1k=0.036),
    "openai/text-embedding-3-small": Pricing(input_per_1k=0.00002, output_per_1k=0.0),
    "meta-llama/llama-3-8b": Pricing(input_per_1k=0.00008, output_per_1k=0.00008),
    "deepseek/deepseek-coder": Pricing(input_per_1k=0.00014, output_per_1k=0.00028),
}

_FALLBACK = Pricing(input_per_1k=0.0, output_per_1k=0.0)


def get_anthropic_pricing(model_id: str) -> Pricing:
    return _ANTHROPIC.get(model_id, _FALLBACK)


def get_openai_pricing(model_id: str) -> Pricing:
    return _OPENAI.get(model_id, _FALLBACK)


def get_openrouter_pricing(model_id: str) -> Pricing:
    """model_id is the path after the `openrouter/` prefix."""
    return _OPENROUTER.get(model_id, _FALLBACK)


def compute_cost(pricing: Pricing, tokens_in: int, tokens_out: int) -> float:
    return (tokens_in / 1000.0) * pricing.input_per_1k + (
        tokens_out / 1000.0
    ) * pricing.output_per_1k
