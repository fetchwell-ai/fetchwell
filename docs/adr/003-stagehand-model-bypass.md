# ADR-003: Bypass Stagehand model whitelist via AISdkClient + Proxy

**Date:** 2026-04-14
**Status:** Accepted

## Context

Stagehand v2.5.8 maintains an internal model whitelist that only includes retired Claude 3.7 models. Passing `modelName: "claude-sonnet-4-6"` throws a whitelist error. The whitelist is compiled into the library and cannot be configured externally.

Alternatives considered:
- Pin to Stagehand v2.x that supports current models — no such version exists at time of writing
- Fork Stagehand to remove the whitelist — maintenance burden, would diverge from upstream
- Use `modelName` with a 3.7 alias — would route to a retired/unavailable model

## Decision

Use `AISdkClient` + Anthropic's `createAnthropic` proxy to supply the model to Stagehand without going through its model resolver. The pattern:

```typescript
import { createAnthropic } from "@ai-sdk/anthropic";
import { AISdkClient } from "@browserbasehq/stagehand";

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const client = new AISdkClient({ model: anthropic("claude-sonnet-4-6") });
new Stagehand({ modelClient: client, ... });
```

This bypasses the whitelist entirely by supplying a pre-resolved model instance.

## Consequences

- Current Claude models work without library modification.
- `@ai-sdk/anthropic` must be pinned to `@1.x` (see ADR-004).
- When Stagehand updates its whitelist, this workaround can be removed and replaced with `modelName: "claude-sonnet-4-6"`.
- Both `stagehand-local.ts` and `stagehand-browserbase.ts` must use this pattern.
