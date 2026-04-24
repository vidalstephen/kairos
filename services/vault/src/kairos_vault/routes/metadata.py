"""POST /vault/metadata — retrieve alias metadata."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from kairos_vault import storage
from kairos_vault.auth import verify_internal_auth

router = APIRouter()


class MetadataRequest(BaseModel):
    alias: str


@router.post(
    "/metadata",
    response_model=storage.AliasMetadata,
    dependencies=[Depends(verify_internal_auth)],
)
async def metadata(body: MetadataRequest) -> storage.AliasMetadata:
    try:
        return storage.get_metadata(body.alias)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "unknown_alias", "message": f"Alias not found: {body.alias}"},
        )
