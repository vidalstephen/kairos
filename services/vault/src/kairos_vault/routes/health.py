"""GET /vault/health — service health check (no auth required)."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from kairos_vault import storage

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    entries: int
    oldest_access_ms: int


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        entries=storage.count(),
        oldest_access_ms=storage.oldest_access_ms(),
    )
