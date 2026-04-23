# Cloudflare Tunnel Integration

Kairos reuses the VPS-wide `cloudflared-vps0` tunnel (ID `8a6e0d58-bd78-42c3-931a-284a384b1fe6`) rather than running its own tunnel container.

Deployment adds:

```
# on the VPS, in ~/docker/infra/cloudflared/config.yml
ingress:
  - hostname: kairos.vectorhost.net
    service: http://kairos-frontend:3000
    originRequest:
      noHappyEyeballs: true
  # ... existing rules ...
  - service: http_status:404
```

DNS: CNAME `kairos.vectorhost.net` → `8a6e0d58-bd78-42c3-931a-284a384b1fe6.cfargotunnel.com` (provisioned via CF API using `CF_API_TOKEN` from `~/docker/infra/traefik/.env`).

Network: `kairos-frontend` attaches to the shared `proxy` docker network so `cloudflared-vps0` can reach it by container name.

Provisioning script lives at `scripts/provision-cf-tunnel.sh` (Phase 5.6).

See the `add-docker-service` skill for the canonical procedure.
