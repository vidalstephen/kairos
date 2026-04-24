"""Vault service entrypoint."""
from __future__ import annotations

import os
import sys

import structlog
import uvicorn
from fastapi import FastAPI

from kairos_vault import crypto
from kairos_vault.routes import aliases, health, metadata, resolve, rotate, store

log = structlog.get_logger().bind(service="vault")

app = FastAPI(title="kairos-vault", version="0.0.0")

app.include_router(resolve.router, prefix="/vault")
app.include_router(store.router, prefix="/vault")
app.include_router(metadata.router, prefix="/vault")
app.include_router(rotate.router, prefix="/vault")
app.include_router(aliases.router, prefix="/vault")
app.include_router(health.router, prefix="/vault")


@app.on_event("startup")
async def on_startup() -> None:
    try:
        crypto.validate_master_key()
    except Exception as exc:
        log.error("vault.startup.key_validation_failed", error=str(exc))
        sys.exit(1)
    log.info("vault.startup", port=int(os.getenv("PORT", "8001")))


def main() -> None:
    uvicorn.run(
        "kairos_vault.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8001")),
        log_config=None,
    )


if __name__ == "__main__":
    main()
