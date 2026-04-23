# Traefik Integration

Kairos does **not** run its own Traefik instance. Public traffic arrives via Cloudflare Tunnel, bypassing Traefik entirely.

The VPS-wide Traefik (`~/docker/infra/traefik/`) still provides:
- Wildcard cert `*.vectorhost.net` (Let's Encrypt DNS-01) — informational only for Kairos
- Middleware definitions (`secure-headers`, etc.) — not currently attached to Kairos ingress

If a future direct-routing need arises (e.g., internal tools on the VPS reaching Kairos without going through CF), labels would be added here. For now this directory is intentionally near-empty.

See [deploy.md](../../docs/operations/deploy.md) and [ADR-0011](../../docs/adr/0011-deployment.md).
