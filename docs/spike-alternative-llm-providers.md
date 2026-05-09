# Spike: Alternative LLM Providers for Stagehand

**Date:** 2026-05-08
**Author:** spike research (browser-agent-team-hfs)
**Status:** findings only — no code changes

---

## Summary

Stagehand v2.5.8 has **first-class multi-provider support** via its `AISdkClient` path. Supporting Gemini or OpenAI as an alternative to Anthropic is technically feasible and is a medium-effort change. The biggest work items are the UI/credential plumbing and the config-schema changes, not Stagehand itself.

---

## 1. Does Stagehand Support Non-Anthropic Models?

**Yes — comprehensively.** The installed version (`@browserbasehq/stagehand@2.5.8`, noted `2.3.0` in `package.json` but `2.5.8` is what resolved) supports:

### Built-in named providers (via `modelToProviderMap` in `dist/index.js`)

| Provider | Sample model names |
|---|---|
| `openai` | `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `o3`, `o4-mini`, etc. |
| `anthropic` | `claude-3-7-sonnet-latest`, `claude-haiku-4-5` |
| `google` | `gemini-2.0-flash`, `gemini-2.5-pro-preview-03-25`, `gemini-1.5-pro`, etc. |
| `cerebras` | `cerebras-llama-3.3-70b`, etc. |
| `groq` | `groq-llama-3.3-70b-versatile`, etc. |

When passed as `modelName` to `Stagehand({ modelName, modelClientOptions: { apiKey } })`, Stagehand selects the appropriate internal client automatically.

### AI SDK provider path (via `modelName: "provider/model-id"` format)

When the model name contains a `/`, Stagehand calls `getAISDKLanguageModel(subProvider, subModelName, apiKey)` and wraps the result in an `AISdkClient`. The supported sub-providers are: `openai`, `anthropic`, `google`, `xai`, `azure`, `groq`, `cerebras`, `togetherai`, `mistral`, `deepseek`, `perplexity`, `ollama`.

The corresponding `@ai-sdk/*` packages are listed as **optional dependencies** in Stagehand's `package.json`. They are not installed in this project's `node_modules` today. Only `@ai-sdk/anthropic` (our manual install) is present.

### Current FetchWell approach

FetchWell does **not** use either of Stagehand's built-in provider paths. Instead, `stagehand-local.ts` manually:
1. Imports `createAnthropic` from `@ai-sdk/anthropic`
2. Builds a model object
3. Wraps it in a `Proxy` to inject `maxTokens: 16384`
4. Passes the wrapped model to `new AISdkClient({ model })`

This bypasses Stagehand's model whitelist entirely and was deliberately chosen to allow use of newer Claude models (e.g. `claude-sonnet-4-6`).

---

## 2. MaxTokens Situation

### The existing bug and its workaround

`AISdkClient.createChatCompletion` calls `generateObject` (Vercel AI SDK) **without passing `maxTokens`**. That means the model default applies. For Claude, the API default is 4096 output tokens, which caused truncation on long health-portal pages.

The `Proxy` in `stagehand-local.ts` intercepts `doGenerate`/`doStream` calls on the model object and injects `{ maxTokens: 16384, ...opts }` before forwarding, forcing a higher limit.

### Per-provider analysis

| Provider | Default output limit | Can Stagehand's default cause truncation? |
|---|---|---|
| Anthropic (`claude-sonnet-4-6`) | 4,096 (API default) | Yes — known issue, Proxy works around it |
| OpenAI (`gpt-4o`) | Model-dependent (often 4,096–16,384) | Possibly, depends on model |
| Gemini (`gemini-2.0-flash`) | 8,192 default output tokens | Less likely but not zero |

The `AISdkClient` path (used for the `/` model format) does not pass `maxTokens` in `generateObject` calls either (confirmed in `dist/index.js` lines 5856–5868). The Proxy workaround in `stagehand-local.ts` would need to be adapted for other providers but the same technique applies.

For the named-provider path (e.g. `modelName: "gemini-2.0-flash"` with `modelClientOptions: { apiKey }`), Stagehand uses `GoogleClient` directly. That client **does** pass `maxTokens` into the Google SDK call chain (line 6877 in `dist/index.js`: `maxOutputTokens: maxTokens`), but the value of `maxTokens` comes from `options.maxTokens` which Stagehand itself never sets in `createChatCompletion` calls originating from `act()`/`extract()`/`observe()`. So truncation risk exists there too.

**Bottom line:** whichever provider path is used, FetchWell should keep or adapt the `maxTokens` injection. The Proxy technique works for any AI SDK `LanguageModel` object. For the named-provider path, the only clean option is the custom `AISdkClient` + Proxy approach already in use.

---

## 3. UI Changes Needed

Current `Settings.tsx` has a single "API key" card with:
- Hardcoded placeholder `sk-ant-...`
- Hardcoded instruction "Starts with sk-ant-. Get one at console.anthropic.com"
- Hardcoded validation in `electron/credentials.ts → validateApiKeyFormat()` that requires `sk-ant-` prefix

To support multiple providers, the UI would need:

1. **Provider selector** — a dropdown or segmented control for `Anthropic / OpenAI / Gemini` (at minimum)
2. **Dynamic placeholder and hint** — text that changes based on selected provider
3. **Dynamic validation** — format differs per provider:
   - Anthropic: `sk-ant-...`
   - OpenAI: `sk-...` (but not `sk-ant-`)
   - Gemini (Google AI Studio): `AIza...`
4. **Conditional documentation links** — currently hardcodes `console.anthropic.com`
5. **Model selector or default model** — users may want to pick specific models

The Settings page is owned by sibling task **browser-agent-team-2ol.3** in this sprint. Any UI work here must be coordinated with that task.

---

## 4. Config Schema Changes (`src/config.ts`)

Currently `src/config.ts` only stores portal-level configuration (URL, auth strategy, credentials). The LLM provider/key is stored separately in `electron/credentials.ts` (encrypted) and passed as `ANTHROPIC_API_KEY` env var to the subprocess.

To support alternative providers, changes are needed in two places:

### A. `electron/credentials.ts` / `CredentialsManager`

The `CredentialsFileFormat` stores a single `apiKey?: string`. This would need to become provider-aware:

```ts
// Option A: single key with stored provider type in config
apiKey?: string;

// Option B: keyed by provider
apiKeys?: { anthropic?: string; openai?: string; google?: string };
activeProvider?: 'anthropic' | 'openai' | 'google';
```

Option A is simpler and avoids storing multiple secrets unnecessarily. The provider selection can live in `AppConfig` (non-sensitive settings).

### B. `electron/config.ts` / `AppConfig`

A new `llmProvider?: 'anthropic' | 'openai' | 'google'` field (defaulting to `'anthropic'`) would need to be added to the config schema and persisted.

### C. `electron/pipeline-bridge.ts` → `RunConfig`

`RunConfig` currently has `apiKey: string`. It would need a companion `llmProvider` field:

```ts
apiKey: string;
llmProvider: 'anthropic' | 'openai' | 'google';
```

And in the subprocess env setup (line 160), the env var name would vary:

```ts
// Today:
ANTHROPIC_API_KEY: config.apiKey

// With multi-provider:
...(config.llmProvider === 'anthropic' && { ANTHROPIC_API_KEY: config.apiKey }),
...(config.llmProvider === 'openai'    && { OPENAI_API_KEY: config.apiKey }),
...(config.llmProvider === 'google'    && { GOOGLE_API_KEY: config.apiKey }),
```

### D. `src/browser/providers/stagehand-local.ts`

The `createAnthropic` import and model construction would need to branch on provider. A clean approach: replace the hardcoded `@ai-sdk/anthropic` usage with a dynamic lookup through Stagehand's `LLMProvider.getAISDKLanguageModel()` function, or install and conditionally import `@ai-sdk/openai` / `@ai-sdk/google`.

### E. `src/config.ts` (portal config schema)

**No changes required.** The LLM provider is a global app setting, not per-portal. Portal config stays as-is.

---

## 5. Cost Comparison

Stagehand makes LLM calls for every `act()`, `extract()`, and `observe()` call. A typical FetchWell run (discover + extract labs + visits + meds + messages across one portal) triggers on the order of 50–200 LLM calls, many of which include a base64-encoded screenshot plus the full DOM.

Approximate per-run cost estimates (rough, based on public pricing as of mid-2026):

| Provider/Model | Input $/1M tokens | Output $/1M tokens | Est. cost / run |
|---|---|---|---|
| Claude Sonnet 4.6 (current) | ~$3 | ~$15 | $1–$5 |
| GPT-4o | $2.50 | $10 | $0.75–$3 |
| GPT-4o-mini | $0.15 | $0.60 | $0.05–$0.20 |
| Gemini 2.0 Flash | $0.075 | $0.30 | $0.03–$0.10 |
| Gemini 2.5 Pro | $1.25–$2.50 | $10 | $0.50–$3 |

**Key insight:** Gemini 2.0 Flash would be dramatically cheaper (~30–100x vs Claude Sonnet). GPT-4o-mini is also very cheap. However, the current pipeline relies heavily on reliable structured extraction (`extract()` with Zod schemas), where frontier model quality matters most. Cheaper models may fail or hallucinate more on health portal DOM content.

---

## 6. Model-Specific Quirks

### OpenAI (GPT-4o, GPT-4.1)

- Well-supported in Stagehand — `OpenAIClient` is the most tested path
- GPT-4o-mini may struggle with complex multi-step navigation; GPT-4.1 is likely fine
- OpenAI's `o-series` models (o3, o4-mini) use `max_completion_tokens` not `max_tokens` — Stagehand handles this internally (line 9166–9170 in `dist/index.js`)
- No vision quirks for standard `gpt-4o`

### Google Gemini

- Stagehand has a `GoogleClient` that uses `@google/genai` SDK (bundled in Stagehand's own `dependencies`)
- Named models like `gemini-2.0-flash` work via `modelName` + `modelClientOptions: { apiKey }` without any extra installs
- Gemini has **different JSON schema restrictions** than OpenAI/Anthropic. Stagehand has `decorateGeminiSchema()` to handle this (line 2189 in `dist/index.js`), but quirks may still surface with complex Zod schemas
- Gemini models are multimodal and support vision, but the image format differs from Anthropic's (no `source.data` — just a URL or `image` part). The `AISdkClient` path normalizes this; the direct `GoogleClient` path handles it internally
- **Rate limits are aggressive** on the free tier of Google AI Studio; production use requires billing enabled on Google Cloud

### Anthropic (current)

- Currently accessed via custom `AISdkClient` + Proxy, bypassing the built-in `AnthropicClient`
- `claude-sonnet-4-6` is not in Stagehand's `modelToProviderMap` whitelist — that's why the bypass was needed and remains necessary

---

## 7. Recommended Approach

If implementing multi-provider support, the recommended path is:

**Phase 1 — Groundwork (1–2 days)**
1. Add `llmProvider: 'anthropic' | 'openai' | 'google'` to `AppConfig` (default `'anthropic'`)
2. Update `RunConfig` in pipeline-bridge to carry `llmProvider`
3. Update subprocess env setup to pass the right env var name
4. Install `@ai-sdk/openai` and `@ai-sdk/google` as project dependencies

**Phase 2 — Provider abstraction in stagehand-local.ts (half day)**
1. Replace the hardcoded `createAnthropic` with a factory function that switches on `llmProvider`
2. Keep the `Proxy` for `maxTokens` injection — it works for all AI SDK `LanguageModel` objects
3. Accept a `llmProvider` parameter alongside `apiKey` in `StagehandLocalProvider`

**Phase 3 — UI changes (1 day)**
1. Add provider selector to Settings "API key" card
2. Update placeholder, hint text, and validation per provider
3. Keep single-key storage — just also store which provider is active

**Phase 4 — Testing (1 day)**
1. Unit tests for the provider factory and validation functions
2. Manual smoke test with a real Gemini or OpenAI key against a test portal

**Total estimated effort: 3–4 days** of implementation, plus any model quality issues discovered during testing.

---

## 8. Blockers / Risks

1. **Model quality on health portals.** Discovery (building nav-map.json) is the most LLM-intensive step. Cheaper models (Gemini Flash, GPT-4o-mini) may navigate incorrectly or fail to classify portal sections. This is an empirical risk, not a code risk.

2. **Zod schema compatibility with Gemini.** The `decorateGeminiSchema` function in Stagehand handles some cases, but complex nested Zod schemas used in `extract()` may hit edge cases. Manual testing against real portals is required before shipping Gemini support.

3. **UI ownership conflict.** `Settings.tsx` is owned by sibling task `browser-agent-team-2ol.3`. Any UI work for this feature must be coordinated with or deferred after that task.

4. **`@ai-sdk/*` package compatibility.** Stagehand lists `@ai-sdk/openai` and `@ai-sdk/google` as `optionalDependencies` with `^1.x` version ranges. FetchWell currently has `@ai-sdk/anthropic@1.2.12`. Adding `@ai-sdk/openai` and `@ai-sdk/google` should install compatible versions automatically, but needs verification.

5. **Claude sonnet-4-6 model name not whitelisted in Stagehand.** This is already handled by the current AISdkClient bypass. The same approach works for other providers — no regression risk from the current custom path.

6. **Credential storage migration.** If a user already has an Anthropic key stored and the app is updated to add a provider field, the migration needs to be graceful (default to `'anthropic'`). This is straightforward but must be explicitly handled.
