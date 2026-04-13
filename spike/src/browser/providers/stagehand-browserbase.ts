import { Stagehand } from "@browserbasehq/stagehand";
import Browserbase from "@browserbasehq/sdk";
import { ZodSchema } from "zod";
import {
  BrowserProvider,
  WaitCondition,
  ObserveResult,
  ElementHandle,
} from "../interface.js";

export class StagehandBrowserbaseProvider implements BrowserProvider {
  private stagehand!: Stagehand;
  private bb: Browserbase;
  private sessionId!: string;

  constructor() {
    this.bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });
  }

  async init(): Promise<void> {
    this.stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey: process.env.BROWSERBASE_API_KEY!,
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
      modelName: "claude-sonnet-4-6",
      modelClientOptions: {
        apiKey: process.env.ANTHROPIC_API_KEY!,
      },
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
    return this.stagehand.page.evaluate(() => {
      const el =
        document.querySelector("main") ??
        document.querySelector("[role='main']") ??
        document.querySelector("#mainContent") ??
        document.body;
      return (el as HTMLElement).innerText ?? "";
    });
  }

  async pageHtml(): Promise<string> {
    return this.stagehand.page.evaluate(() => {
      const el =
        document.querySelector("main") ??
        document.querySelector("[role='main']") ??
        document.querySelector("#mainContent") ??
        document.body;
      return (el as HTMLElement).innerHTML ?? "";
    });
  }

  async close(): Promise<void> {
    await this.stagehand.close();
  }
}
