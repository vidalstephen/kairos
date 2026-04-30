# syntax=docker/dockerfile:1.7
FROM python:3.14-slim AS base
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update && apt-get install -y --no-install-recommends tini curl \
 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir uv==0.4.18

FROM base AS deps
COPY pyproject.toml ./
RUN uv pip install --system --no-cache -e . --group dev

FROM deps AS dev
ENV PYTHONPATH=/app/src
COPY src ./src
EXPOSE 8000
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["uvicorn","kairos_cognition.main:app","--host","0.0.0.0","--port","8000","--reload","--reload-dir","/app/src"]

FROM base AS prod
ENV PYTHONPATH=/app/src
COPY pyproject.toml ./
RUN uv pip install --system --no-cache -e .
COPY src ./src
RUN useradd -u 1000 -m kairos && chown -R kairos:kairos /app
USER kairos
EXPOSE 8000
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["uvicorn","kairos_cognition.main:app","--host","0.0.0.0","--port","8000"]
