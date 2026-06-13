/**
 * Unit tests for StagehandLocalProvider timeout and waitFor fixes
 * (browser-agent-team-8ru.6).
 *
 * Tests:
 * 1. act() rejects after ~120s when the underlying LLM call hangs
 * 2. extract() rejects after ~120s when the underlying LLM call hangs
 * 3. observe() rejects after ~120s when the underlying LLM call hangs
 * 4. waitFor({ type: 'navigation' }) waits for a real URL change (not no-op)
 * 5. waitFor({ type: 'networkIdle' }) passes timeout to waitForLoadState
 *
 * We use vitest fake timers to avoid real 120-second waits.
 * The StagehandLocalProvider class is not instantiated directly — instead we
 * test the `withTimeout` helper via dynamic import so the module system can be
 * exercised without spawning a real browser.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Stagehand so no real browser or LLM calls are made
// ---------------------------------------------------------------------------

// We need to mock before importing the provider
vi.mock('@browserbasehq/stagehand', () => {
  return {
    Stagehand: vi.fn(),
    AISdkClient: vi.fn(),
  };
});

vi.mock('@ai-sdk/anthropic', () => {
  return {
    createAnthropic: vi.fn(() => (_modelId: string) => ({})),
  };
});

vi.mock('playwright', () => {
  return {
    chromium: {
      executablePath: vi.fn().mockReturnValue('/fake/chromium'),
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock page with configurable act/extract/observe and url() behavior.
 */
function makeMockPage(overrides: {
  act?: () => Promise<void>;
  extract?: () => Promise<unknown>;
  observe?: () => Promise<unknown[]>;
  url?: () => string;
  waitForURL?: (predicate: (url: URL) => boolean) => Promise<void>;
  waitForLoadState?: (state: string, options?: { timeout?: number }) => Promise<void>;
} = {}) {
  return {
    act: vi.fn(overrides.act ?? (() => Promise.resolve())),
    extract: vi.fn(overrides.extract ?? (() => Promise.resolve({}))),
    observe: vi.fn(overrides.observe ?? (() => Promise.resolve([]))),
    url: vi.fn(overrides.url ?? (() => 'https://example.com/page1')),
    waitForURL: vi.fn(overrides.waitForURL ?? ((_pred: (url: URL) => boolean) => Promise.resolve())),
    waitForLoadState: vi.fn(overrides.waitForLoadState ?? ((_state: string, _opts?: { timeout?: number }) => Promise.resolve())),
    waitForSelector: vi.fn(() => Promise.resolve()),
    goto: vi.fn(() => Promise.resolve()),
    screenshot: vi.fn(() => Promise.resolve(Buffer.from(''))),
    fill: vi.fn(() => Promise.resolve()),
    evaluate: vi.fn(() => Promise.resolve()),
    pdf: vi.fn(() => Promise.resolve(Buffer.from(''))),
    locator: vi.fn(() => ({ click: vi.fn(() => Promise.resolve()) })),
    $: vi.fn(() => Promise.resolve(null)),
    title: vi.fn(() => Promise.resolve('')),
    context: vi.fn(() => ({
      cookies: vi.fn(() => Promise.resolve([])),
      addCookies: vi.fn(() => Promise.resolve()),
    })),
  };
}

/**
 * Build a StagehandLocalProvider with a pre-wired mock page.
 * Bypasses real init() by directly assigning the internal stagehand instance.
 */
async function makeProvider(pageMock: ReturnType<typeof makeMockPage>) {
  const { StagehandLocalProvider } = await import('../../src/browser/providers/stagehand-local.js');
  const provider = new StagehandLocalProvider({ headless: true, apiKey: 'test-key' });

  // Bypass init() — inject a fake stagehand instance with our mock page
  (provider as any).stagehand = {
    page: pageMock,
    init: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };

  return provider;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StagehandLocalProvider — act/extract/observe timeouts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('act() rejects after 120s when the LLM call hangs', async () => {
    // Hung promise that never resolves
    const page = makeMockPage({ act: () => new Promise<void>(() => { /* never resolves */ }) });
    const provider = await makeProvider(page);

    // Kick off the call and race it against advanceTimersByTimeAsync
    const actPromise = provider.act('click the submit button')
      .catch((e: Error) => { throw e; }); // ensure rejection is caught via .rejects below

    // Advance timers past the 120s timeout and race for the rejection
    const [result] = await Promise.allSettled([
      actPromise,
      vi.advanceTimersByTimeAsync(120_001),
    ]);

    expect(result.status).toBe('rejected');
    expect((result as PromiseRejectedResult).reason.message).toMatch('act() timed out after 120s');
  });

  it('act() resolves normally when LLM responds before 120s', async () => {
    const page = makeMockPage({ act: () => Promise.resolve() });
    const provider = await makeProvider(page);

    const result = await provider.act('click something');
    expect(result).toBeUndefined();
  });

  it('extract() rejects after 120s when the LLM call hangs', async () => {
    const page = makeMockPage({ extract: () => new Promise<unknown>(() => { /* never resolves */ }) });
    const provider = await makeProvider(page);

    const { z } = await import('zod');
    const schema = z.object({ value: z.string() });

    const extractPromise = provider.extract(schema, 'extract the result value')
      .catch((e: Error) => { throw e; });

    const [result] = await Promise.allSettled([
      extractPromise,
      vi.advanceTimersByTimeAsync(120_001),
    ]);

    expect(result.status).toBe('rejected');
    expect((result as PromiseRejectedResult).reason.message).toMatch('extract() timed out after 120s');
  });

  it('extract() resolves normally when LLM responds before 120s', async () => {
    const page = makeMockPage({ extract: () => Promise.resolve({ value: 'hello' }) });
    const provider = await makeProvider(page);

    const { z } = await import('zod');
    const schema = z.object({ value: z.string() });

    const result = await provider.extract(schema, 'get value');
    expect(result).toEqual({ value: 'hello' });
  });

  it('observe() rejects after 120s when the LLM call hangs', async () => {
    const page = makeMockPage({ observe: () => new Promise<unknown[]>(() => { /* never resolves */ }) });
    const provider = await makeProvider(page);

    const observePromise = provider.observe('find all result links')
      .catch((e: Error) => { throw e; });

    const [result] = await Promise.allSettled([
      observePromise,
      vi.advanceTimersByTimeAsync(120_001),
    ]);

    expect(result.status).toBe('rejected');
    expect((result as PromiseRejectedResult).reason.message).toMatch('observe() timed out after 120s');
  });

  it('observe() resolves normally when LLM responds before 120s', async () => {
    const results = [{ selector: '#link-1', description: 'Lab result 1' }];
    const page = makeMockPage({ observe: () => Promise.resolve(results) });
    const provider = await makeProvider(page);

    const result = await provider.observe('find links');
    expect(result).toEqual(results);
  });

  it('timeout error message includes instruction truncated at 80 chars', async () => {
    const longInstruction = 'a'.repeat(200);
    const page = makeMockPage({ act: () => new Promise<void>(() => { /* never resolves */ }) });
    const provider = await makeProvider(page);

    const actPromise = provider.act(longInstruction)
      .catch((e: Error) => { throw e; });

    const [result] = await Promise.allSettled([
      actPromise,
      vi.advanceTimersByTimeAsync(120_001),
    ]);

    expect(result.status).toBe('rejected');
    const msg = (result as PromiseRejectedResult).reason.message as string;
    expect(msg).toMatch(/act\(\) timed out after 120s/);
    // Should include exactly 80 'a' chars (the truncated instruction)
    expect(msg).toContain('a'.repeat(80));
    // Should NOT include 81 'a' chars (i.e., it was truncated, not the full 200)
    expect(msg).not.toContain('a'.repeat(81));
  });
});

describe('StagehandLocalProvider — waitFor navigation fix', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waitFor navigation calls waitForURL with a predicate that excludes current URL', async () => {
    const currentUrl = 'https://example.com/page1';
    let capturedPredicate: ((url: URL) => boolean) | null = null;

    const page = makeMockPage({
      url: () => currentUrl,
      waitForURL: (predicate: (url: URL) => boolean) => {
        capturedPredicate = predicate;
        return Promise.resolve();
      },
    });
    const provider = await makeProvider(page);

    const waitPromise = provider.waitFor({ type: 'navigation' });
    await vi.runAllTimersAsync();
    await waitPromise;

    expect(capturedPredicate).not.toBeNull();
    // Predicate should reject the current URL
    expect(capturedPredicate!(new URL(currentUrl))).toBe(false);
    // Predicate should accept a different URL
    expect(capturedPredicate!(new URL('https://example.com/page2'))).toBe(true);
  });

  it('waitFor navigation does NOT immediately match the current URL (no-op guard)', async () => {
    const currentUrl = 'https://portal.example.com/labs';
    let resolvedImmediately = false;

    const page = makeMockPage({
      url: () => currentUrl,
      waitForURL: (predicate: (url: URL) => boolean) => {
        // Simulate: immediately check if predicate(currentUrl) resolves — it should NOT
        if (predicate(new URL(currentUrl))) {
          resolvedImmediately = true;
          return Promise.resolve();
        }
        // Stays pending (waiting for a real navigation)
        return new Promise(() => { /* pending */ });
      },
    });
    const provider = await makeProvider(page);

    provider.waitFor({ type: 'navigation' }); // intentionally not awaited
    await vi.runAllTimersAsync();

    expect(resolvedImmediately).toBe(false);
  });
});

describe('StagehandLocalProvider — waitFor networkIdle timeout', () => {
  it('passes condition.timeout to waitForLoadState when provided', async () => {
    const page = makeMockPage();
    const provider = await makeProvider(page);

    await provider.waitFor({ type: 'networkIdle', timeout: 5_000 });

    expect(page.waitForLoadState).toHaveBeenCalledWith('networkidle', { timeout: 5_000 });
  });

  it('passes default 30s timeout to waitForLoadState when no timeout provided', async () => {
    const page = makeMockPage();
    const provider = await makeProvider(page);

    await provider.waitFor({ type: 'networkIdle' });

    expect(page.waitForLoadState).toHaveBeenCalledWith('networkidle', { timeout: 30_000 });
  });
});

describe('StagehandLocalProvider — init() failure closes browser', () => {
  it('calls stagehand.close() when init throws, then re-throws', async () => {
    const { Stagehand } = await import('@browserbasehq/stagehand');
    const { AISdkClient } = await import('@browserbasehq/stagehand');

    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockInit = vi.fn().mockRejectedValue(new Error('Chromium failed to launch'));

    (Stagehand as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      init: mockInit,
      close: mockClose,
      page: makeMockPage(),
    }));

    (AISdkClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({}));

    const { createAnthropic } = await import('@ai-sdk/anthropic');
    (createAnthropic as unknown as ReturnType<typeof vi.fn>).mockReturnValue(() => ({}));

    const { StagehandLocalProvider } = await import('../../src/browser/providers/stagehand-local.js');
    const provider = new StagehandLocalProvider({ headless: true, apiKey: 'test-key' });

    await expect(provider.init()).rejects.toThrow('Chromium failed to launch');
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
