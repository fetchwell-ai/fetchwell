import { Stagehand, AISdkClient } from "@browserbasehq/stagehand";
import { createAnthropic } from "@ai-sdk/anthropic";
import { ZodSchema } from "zod";
import {
  BrowserProvider,
  WaitCondition,
  ObserveResult,
  ElementHandle,
  SerializedSession,
} from "../interface.js";

export class StagehandLocalProvider implements BrowserProvider {
  private stagehand!: Stagehand;
  private headless: boolean;

  constructor(opts: { headless?: boolean } = {}) {
    this.headless = opts.headless ?? false;
  }

  async init(): Promise<void> {
    // Use AISdkClient with @ai-sdk/anthropic to bypass Stagehand's model whitelist,
    // allowing us to use current Claude models (claude-sonnet-4-6, etc.)
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
    // Wrap the model to inject maxTokens — Stagehand's AISdkClient does not
    // pass maxTokens to generateObject, causing a 4096-token truncation.
    const baseModel = anthropic("claude-sonnet-4-6");
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

    this.stagehand = new Stagehand({
      env: "LOCAL",
      llmClient,
      localBrowserLaunchOptions: { headless: this.headless },
      verbose: 1,
      disablePino: true,
    });
    await this.stagehand.init();
  }

  async navigate(url: string): Promise<void> {
    await this.stagehand.page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 1500));
  }

  async act(instruction: string): Promise<void> {
    await this.stagehand.page.act(instruction);
  }

  async extract<T>(schema: ZodSchema<T>, instruction: string): Promise<T> {
    return this.stagehand.page.extract({ instruction, schema: schema as any });
  }

  async observe(instruction: string): Promise<ObserveResult[]> {
    return this.stagehand.page.observe(instruction);
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
      case "navigation":
        await this.stagehand.page.waitForURL("**/*");
        break;
      case "selector":
        await this.stagehand.page.waitForSelector(condition.selector, {
          timeout: condition.timeout ?? 30_000,
        });
        break;
      case "networkIdle":
        await this.stagehand.page.waitForLoadState("networkidle");
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

  async saveSession(): Promise<SerializedSession> {
    const cookies = await this.stagehand.page.context().cookies();
    return { cookies: cookies as SerializedSession["cookies"], savedAt: new Date().toISOString() };
  }

  async loadSession(session: SerializedSession): Promise<void> {
    await this.stagehand.page.context().addCookies(session.cookies as any);
  }

  async close(): Promise<void> {
    await this.stagehand.close();
  }
}
