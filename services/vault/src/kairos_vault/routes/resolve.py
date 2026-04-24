"""POST /vault/resolve — look up and return a credential value."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from kairos_vault import storage
from kairos_vault.auth import verify_internal_auth

router = APIRouter()


class ResolveRequest(BaseModel):
    alias: str
    caller: str
    purpose: str
    run_id: str | None = None
    tool_execution_id: str | None = None


class ResolveResponse(BaseModel):
    resolved: str
    access_id: str


@router.post(
    "/resolve",
    response_model=ResolveResponse,
    dependencies=[Depends(verify_internal_auth)],
)
async def resolve(body: ResolveRequest) -> ResolveResponse:
    try:
        value, access_id = storage.resolve(body.alias)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "unknown_alias", "message": f"Alias not found: {body.alias}"},
        )
    return ResolveResponse(resolved=value, access_id=access_id)
