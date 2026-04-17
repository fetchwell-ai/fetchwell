import { Stagehand, AISdkClient } from "@browserbasehq/stagehand";
import Browserbase from "@browserbasehq/sdk";
import { createAnthropic } from "@ai-sdk/anthropic";
import { ZodSchema } from "zod";
import {
  BrowserProvider,
  WaitCondition,
  ObserveResult,
  ElementHandle,
} from "../interface.js";
import { getPageText, getPageHtml } from "../page-eval.js";

export class StagehandBrowserbaseProvider implements BrowserProvider {
  private stagehand!: Stagehand;
  private bb: Browserbase;
  private sessionId!: string;

  constructor() {
    this.bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });
  }

  async init(): Promise<void> {
    // Use AISdkClient + Proxy to bypass Stagehand's stale model whitelist,
    // allowing current Claude models (claude-sonnet-4-6, etc.)
    // Wrap the model to inject maxTokens — Stagehand's AISdkClient does not
    // pass maxTokens to generateObject, causing a 4096-token truncation.
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
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
      env: "BROWSERBASE",
      apiKey: process.env.BROWSERBASE_API_KEY!,
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
      llmClient,
      verbose: 1,
      disablePino: true,
    });
    const initResult = await this.stagehand.init();
    this.sessionId = initResult.sessionId;
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
    const debug = await this.bb.sessions.debug(this.sessionId);
    return debug.debuggerFullscreenUrl;
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

  async clickSelector(selector: string): Promise<void> {
    await this.stagehand.page.locator(selector).click({ timeout: 5000 });
  }

  async close(): Promise<void> {
    await this.stagehand.close();
  }
}
