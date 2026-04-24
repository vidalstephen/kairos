"""GET /vault/aliases — list all alias metadata."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from kairos_vault import storage
from kairos_vault.auth import verify_internal_auth

router = APIRouter()


@router.get(
    "/aliases",
    response_model=list[storage.AliasMetadata],
    dependencies=[Depends(verify_internal_auth)],
)
async def aliases() -> list[storage.AliasMetadata]:
    return storage.list_aliases()
