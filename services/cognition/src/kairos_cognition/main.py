"""Cognition service entrypoint — Phase 0."""
from __future__ import annotations

import os

import structlog
import uvicorn
from fastapi import FastAPI

log = structlog.get_logger().bind(service="cognition")

app = FastAPI(title="kairos-cognition", version="0.0.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.on_event("startup")
async def on_startup() -> None:
    log.info("cognition.startup", port=int(os.getenv("PORT", "8000")))


def main() -> None:
    uvicorn.run(
        "kairos_cognition.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        log_config=None,
    )


if __name__ == "__main__":
    main()
