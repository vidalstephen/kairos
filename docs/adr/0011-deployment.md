# ADR-0011: Deployment via Cloudflare Tunnel

Status: Accepted  
Date: 2026-04-23

## Context

Kairos will be deployed at `kairos.vectorhost.net` on the Hostinger VPS (srv1131719). The host already runs Cloudflare Tunnel for all `*.vectorhost.net` public routing and Traefik for certificate management and middleware (secure-headers, authelia-auth).

## Decision

**Public routing: Cloudflare Tunnel only. Traefik: certificates and middleware only.**

- `kairos.vectorhost.net` DNS CNAME → `8a6e0d58-bd78-42c3-931a-284a384b1fe6.cfargotunnel.com` (existing tunnel)
- Cloudflared container routes to `kairos-frontend:3000` via the shared `proxy` Docker network
- Traefik labels on Kairos services apply middleware (secure-headers) but do not handle public routing
- WebSocket support is native to Cloudflare Tunnel
- Frontend origin-proxies WebSocket traffic from `/ws/*` to the control plane (also via internal network)

Provisioning uses the `add-docker-service` skill already installed on this host.

## Consequences

**Easier**:
- Zero-trust ingress by default (no ports exposed on the VPS)
- Free TLS via Cloudflare
- No separate reverse proxy to operate publicly
- Matches the established pattern on the host

**Harder**:
- Cloudflare Tunnel is a single point of failure for ingress (mitigation: the tunnel reconnects automatically; fallback is direct IP access via ops tooling in emergencies)
- Local development does not mirror production routing (acceptable)

## Alternatives Considered

- **Traefik for public routing + Let's Encrypt**: Would require opening ports on the VPS. Current policy prohibits. Rejected.
- **Direct ingress on a dedicated subdomain with Caddy**: Same objection as above.
