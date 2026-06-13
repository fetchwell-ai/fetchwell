import { Stagehand, AISdkClient } from "@browserbasehq/stagehand";
import { createAnthropic } from "@ai-sdk/anthropic";
import { chromium } from "playwright";
import { ZodSchema } from "zod";
import {
  BrowserProvider,
  WaitCondition,
  ObserveResult,
  ElementHandle,
  SerializedSession,
} from "../interface.js";
import { getPageText, getPageHtml, stripFixedElements } from "../page-eval.js";

/**
 * Race a promise against a timeout. Rejects with a clear error if the timeout
 * fires before the promise resolves. The original promise is not cancelled
 * (JS has no cancellation), but the caller will receive the timeout error.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

export class StagehandLocalProvider implements BrowserProvider {
  private stagehand!: Stagehand;
  private headless: boolean;
  private apiKey?: string;

  constructor(opts: { headless?: boolean; apiKey?: string } = {}) {
    this.headless = opts.headless ?? false;
    this.apiKey = opts.apiKey;
  }

  async init(): Promise<void> {
    const resolvedApiKey = this.apiKey;
    if (!resolvedApiKey) {
      throw new Error("StagehandLocalProvider requires an apiKey");
    }
    // Use AISdkClient with @ai-sdk/anthropic to bypass Stagehand's model whitelist,
    // allowing us to use current Claude models (claude-sonnet-4-6, etc.)
    const anthropic = createAnthropic({
      apiKey: resolvedApiKey,
    });
    // Wrap the model to inject maxTokens — Stagehand's AISdkClient does not
    // pass maxTokens to generateObject, causing a 4096-token truncation.
    const modelId = process.env.STAGEHAND_MODEL ?? "claude-sonnet-4-6";
    const baseModel = anthropic(modelId);
    const model = new Proxy(baseModel, {
      get(target, prop) {
        if (prop === "doGenerate" || prop === "doStream") {
          return (opts: any) =>
            (target as any)[prop]({ maxTokens: 16384, ...opts });
        }
        const val = (target as any)[prop];
        return typeof val === "function" ? val.bind(target) : val;
      },
    });

    const llmClient = new AISdkClient({ model });

    const execPath = this.headless ? chromium.executablePath() : undefined;
    const sandboxArgs = process.env.FETCHWELL_PACKAGED === '1'
      ? ['--no-sandbox', '--disable-gpu-sandbox']
      : [];

    // Stagehand defaults downloadsPath to process.cwd()/downloads.
    // When launched from Finder, cwd is "/" which isn't writable → silent crash.
    const os = await import("node:os");
    const pathMod = await import("node:path");
    const downloadsPath = pathMod.join(os.tmpdir(), "fetchwell-downloads");

    this.stagehand = new Stagehand({
      env: "LOCAL",
      llmClient,
      modelName: `anthropic/${modelId}`,
      localBrowserLaunchOptions: {
        headless: this.headless,
        downloadsPath,
        ...(execPath ? { executablePath: execPath } : {}),
        ...(sandboxArgs.length > 0 ? { args: sandboxArgs } : {}),
      },
      verbose: 1,
      disablePino: true,
    });
    try {
      await this.stagehand.init();
    } catch (err) {
      console.error(`[stagehand] init failed:`, err);
      // Close the browser to prevent Chromium process leaks
      try {
        await this.stagehand.close();
      } catch {
        // best-effort cleanup
      }
      throw err;
    }
  }

  async navigate(url: string): Promise<void> {
    await this.stagehand.page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 1500));
  }

  async act(instruction: string): Promise<void> {
    await withTimeout(
      this.stagehand.page.act({ action: instruction, iframes: true }),
      120_000,
      `act() timed out after 120s (instruction: "${instruction.slice(0, 80)}")`,
    );
  }

  async extract<T>(schema: ZodSchema<T>, instruction: string): Promise<T> {
    return withTimeout(
      this.stagehand.page.extract({ instruction, schema: schema as any, iframes: true }),
      120_000,
      `extract() timed out after 120s (instruction: "${instruction.slice(0, 80)}")`,
    );
  }

  async observe(instruction: string): Promise<ObserveResult[]> {
    return withTimeout(
      this.stagehand.page.observe({ instruction, iframes: true }),
      120_000,
      `observe() timed out after 120s (instruction: "${instruction.slice(0, 80)}")`,
    );
  }

  async screenshot(): Promise<string> {
    const buffer = await this.stagehand.page.screenshot();
    return buffer.toString("base64");
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.stagehand.page.fill(selector, value);
  }

  async waitFor(condition: WaitCondition): Promise<void> {
    switch (condition.type) {
      case "navigation": {
        // waitForURL('**/*') matches the current URL and resolves immediately (no-op).
        // Instead, capture the current URL and wait until it changes.
        const currentUrl = this.stagehand.page.url();
        await this.stagehand.page.waitForURL((url) => url.toString() !== currentUrl);
        break;
      }
      case "selector":
        await this.stagehand.page.waitForSelector(condition.selector, {
          timeout: condition.timeout ?? 30_000,
        });
        break;
      case "networkIdle":
        await this.stagehand.page.waitForLoadState("networkidle", {
          timeout: condition.timeout ?? 30_000,
        });
        break;
    }
  }

  async getDebugUrl(): Promise<string | null> {
    // Local mode — no remote debug URL. The user sees the browser window directly.
    return null;
  }

  async url(): Promise<string> {
    return this.stagehand.page.url();
  }

  async title(): Promise<string> {
    return this.stagehand.page.title();
  }

  async querySelector(selector: string): Promise<ElementHandle | null> {
    const el = await this.stagehand.page.$(selector);
    if (!el) return null;
    return { textContent: () => el.textContent() };
  }

  async pageText(): Promise<string> {
    return this.stagehand.page.evaluate(getPageText);
  }

  async pageHtml(): Promise<string> {
    return this.stagehand.page.evaluate(getPageHtml);
  }

  async saveSession(): Promise<SerializedSession> {
    const cookies = await this.stagehand.page.context().cookies();
    return { cookies: cookies as SerializedSession["cookies"], savedAt: new Date().toISOString() };
  }

  async loadSession(session: SerializedSession): Promise<void> {
    await this.stagehand.page.context().addCookies(session.cookies as any);
  }

  async pdf(): Promise<Buffer> {
    await this.stagehand.page.evaluate(stripFixedElements);
    return this.stagehand.page.pdf({ format: "A4", printBackground: true });
  }

  async clickSelector(selector: string): Promise<void> {
    await this.stagehand.page.locator(selector).click({ timeout: 5000 });
  }

  async close(): Promise<void> {
    await this.stagehand.close();
  }
}
