import { Stagehand } from "@browserbasehq/stagehand";
import { ZodSchema } from "zod";
import {
  BrowserProvider,
  WaitCondition,
  ObserveResult,
  ElementHandle,
} from "../interface.js";

export class StagehandLocalProvider implements BrowserProvider {
  private stagehand!: Stagehand;
  private headless: boolean;

  constructor(opts: { headless?: boolean } = {}) {
    this.headless = opts.headless ?? false;
  }

  async init(): Promise<void> {
    this.stagehand = new Stagehand({
      env: "LOCAL",
      modelName: "claude-sonnet-4-6",
      modelClientOptions: {
        apiKey: process.env.ANTHROPIC_API_KEY!,
      },
      localBrowserLaunchOptions: {
        headless: this.headless,
      },
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

  async close(): Promise<void> {
    await this.stagehand.close();
  }
}
