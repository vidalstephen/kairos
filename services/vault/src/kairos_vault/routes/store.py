"""POST /vault/store — persist a new credential alias."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from kairos_vault import storage
from kairos_vault.auth import verify_internal_auth

router = APIRouter()


class StoreMeta(BaseModel):
    description: str
    scope: str = "global"
    rotation_interval_days: int = 90


class StoreRequest(BaseModel):
    alias: str
    value: str
    metadata: StoreMeta


class StoreResponse(BaseModel):
    stored: bool
    created_at: str


@router.post(
    "/store",
    response_model=StoreResponse,
    dependencies=[Depends(verify_internal_auth)],
    status_code=status.HTTP_201_CREATED,
)
async def store(body: StoreRequest) -> StoreResponse:
    try:
        meta = storage.store(body.alias, body.value, body.metadata.model_dump())
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "alias_exists", "message": f"Alias already exists: {body.alias}"},
        )
    return StoreResponse(stored=True, created_at=meta.created_at)
