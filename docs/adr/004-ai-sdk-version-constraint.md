# ADR-004: Pin @ai-sdk/anthropic to @1.x

**Date:** 2026-04-14
**Status:** Accepted

## Context

The AISdkClient + Proxy pattern (ADR-003) requires `@ai-sdk/anthropic`. Stagehand's internal bundled `ai` package is `ai@4.x`, which implements AI SDK spec v1. The `@ai-sdk/anthropic@3.x` package implements AI SDK spec v2, which is incompatible with Stagehand's internal `ai@4.x`.

Installing `@ai-sdk/anthropic@3.x` causes a version mismatch between the spec version expected by Stagehand's `ai@4.x` and the spec version provided by the Anthropic adapter — resulting in a runtime error when Stagehand tries to invoke the model.

## Decision

Pin `@ai-sdk/anthropic` to `^1.x` in package.json. Do not upgrade to `@3.x` until Stagehand updates its internal `ai` dependency to v5+ (which would bundle AI SDK spec v2 support).

## Consequences

- `@ai-sdk/anthropic@1.x` provides AI SDK spec v1, compatible with Stagehand's `ai@4.x`.
- This constraint is easy to accidentally break during dependency updates — the incompatibility is not obvious from package names or semver.
- Check Stagehand release notes before upgrading either `@ai-sdk/anthropic` or `stagehand`.
- When Stagehand updates to `ai@5.x` (spec v2), upgrade `@ai-sdk/anthropic` to `@3.x` at the same time.
