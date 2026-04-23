# Executor

Alpine-based container image used as the sandbox for tool execution. One ephemeral instance spawned per tool call. Non-root (1000:1000), read-only root filesystem, tmpfs for scratch space, joined only to the `kairos-sandbox` network with allowlisted egress.

See [../../docs/specs/layer-map.md](../../docs/specs/layer-map.md) §Executor and [../../docs/architecture.md](../../docs/architecture.md) §10.

## Build

```bash
docker build -t kairos-executor:dev .
```

## Contract

The control plane `SandboxService` invokes the container with:
- `env CAPABILITY_TOKEN=<signed-HMAC>` — verified before any action
- bind mount `/workspace` (ro or rw depending on tool params)
- tmpfs `/tmp` (256MB, exec allowed)
- network `kairos-sandbox`
- resource caps: `cpus=1.0 mem=1g pids=256 ulimit nofile=1024`

Tool-specific binaries (git, curl, jq, python3, node) are pre-installed. The sandbox runs one command, captures stdout/stderr/exit, then exits.

## Phase 0

Image builds; carries only stock Alpine + our bootstrap user. Real tool installers and capability-token verifier land in Phase 2.
