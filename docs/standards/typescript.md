# TypeScript Standards

Applies to `services/control-plane/`, `services/frontend/`, and `packages/schemas/`, `packages/event-types/`.

---

## Language

- Node 20 (LTS)
- TypeScript 5.4+
- Target: `ES2022`
- Module: `ESNext` with NodeNext resolution

## Compiler Options

All projects set (or inherit) these strict flags:

```json
{
  "strict": true,
  "exactOptionalPropertyTypes": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "forceConsistentCasingInFileNames": true,
  "isolatedModules": true,
  "resolveJsonModule": true,
  "skipLibCheck": true
}
```

`strict` is not negotiable. `any` requires a reviewer comment.

## Validation at Boundaries

Every external input (HTTP body, WS event, env var, config file) is validated with Zod. Internal functions trust their types.

```ts
const CreateSessionBody = z.object({
  agent_id: z.string().uuid().optional(),
  persona_id: z.string().uuid().optional(),
});
type CreateSessionBody = z.infer<typeof CreateSessionBody>;
```

No ad-hoc type assertions at boundaries. No `as unknown as T` without a schema parse.

## Naming

- Files: `kebab-case.ts`
- Classes, types, interfaces: `PascalCase`
- Functions, variables: `camelCase`
- Constants (true compile-time only): `SCREAMING_SNAKE_CASE`
- React components: `PascalCase.tsx`

## Modules

ESM everywhere. No `require()`. Imports include `.js` extension for local files (NodeNext rule):

```ts
import { policyService } from './policy-service.js';
```

## Errors

- Custom error classes per domain (`PolicyError`, `VaultError`, etc.) with a `code` discriminator
- Never throw strings
- `async` functions must handle or propagate — no floating promises (enforced by eslint)

## Async

- `async/await` over raw promise chains
- `Promise.all` for parallel work (not `.then` pyramids)
- AbortController for cancellable operations, including model calls

## Logging

- pino for control plane
- Structured fields: `{ trace_id, session_id, user_id, msg, ...context }`
- No console.log in production code (eslint rule)
- Never log secrets or vault values

## Testing

- Unit: `vitest`
- Integration: `vitest` with docker-compose fixtures
- E2E: `playwright`
- Coverage target: 80% overall, 100% on policy engine + approval state machine

## ESLint + Prettier

- ESLint with `@typescript-eslint/recommended-type-checked`
- Prettier: 100-column width, single quotes, semicolons, trailing commas
- `eslint-plugin-unicorn` for a curated subset
- Pre-commit hook enforces both

## Dependencies

- Runtime deps pinned to exact versions
- Dev deps range-pinned
- No wildcard versions
- Dependabot auto-PRs for minor/patch

## NestJS (Control Plane)

- Module per domain (`AuthModule`, `SessionsModule`, `PolicyModule`, etc.)
- Services are injectable classes, not standalone functions
- Controllers are thin: parse + delegate + respond
- DTOs use Zod; convert to class-validator at controller boundary if Nest decorator magic is needed
- No circular module imports

## React/Next.js (Frontend)

- Server components by default; `'use client'` only when needed
- State: React Query for server state, Zustand for shared client state, local state for UI-only
- Forms: React Hook Form + Zod resolver
- Styling: Tailwind; shadcn/ui components are authored, not npm-installed (copy-in pattern)
- Accessibility: axe-core in CI; keyboard navigation for every interactive element
