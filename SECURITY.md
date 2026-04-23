# Security Policy

## Reporting a Vulnerability

Do **not** open a public issue for security vulnerabilities.

Email: security@[owner-domain]  
Expected response: within 72 hours.

Include: description, reproduction, affected versions, and any proof-of-concept. We will acknowledge, investigate, and coordinate disclosure.

## Scope of Concern

Kairos has a formal security architecture — see [docs/security/threat-model.md](docs/security/threat-model.md). Vulnerabilities of particular interest:

1. **Layer 0 boundary violations** — any path that lets a prompt, tool result, or self-modification reach the policy engine, credential vault, sandbox enforcement, or network egress control
2. **Credential exposure** — any way a resolved credential can enter an LLM context window, log, trace, or span
3. **Sandbox escape** — any execution path that breaks out of the Tool Execution Lane into the Ego process or host
4. **Prompt injection → network redirect** — any way adversarial tool result content can cause a network call to an unapproved domain
5. **Approval bypass** — any way a gated action (install, stateful-external, destructive) executes without a terminal APPROVED state
6. **Identity confusion** — any way Kairos can act under the owner's personal credentials instead of its own

## Out of Scope

- Theoretical risks with no practical attack path
- Attacks requiring prior root access on the host
- Social engineering of the human operator
- Denial of service through legitimate resource consumption within quotas

## The Layer 0 Commitment

Kairos treats Layer 0 as inviolable. If a vulnerability allows any path to modify Layer 0 from prompt or self-modification flows, it is a critical severity issue regardless of blast radius.
