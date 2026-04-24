"""POST /vault/rotate — rotate the value of an alias."""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from kairos_vault import storage
from kairos_vault.auth import verify_internal_auth

router = APIRouter()


class RotateRequest(BaseModel):
    alias: str
    new_value: str | None = None


class RotateResponse(BaseModel):
    rotated_at: str
    new_rotates_at: str


@router.post(
    "/rotate",
    response_model=RotateResponse,
    dependencies=[Depends(verify_internal_auth)],
)
async def rotate(body: RotateRequest) -> RotateResponse:
    try:
        meta = storage.rotate(body.alias, body.new_value)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "unknown_alias", "message": f"Alias not found: {body.alias}"},
        )
    rotated_at = datetime.now(UTC).isoformat()
    return RotateResponse(rotated_at=rotated_at, new_rotates_at=meta.rotates_at)
