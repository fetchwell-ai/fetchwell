import { chromium, Browser, Page } from "playwright";
import { ZodSchema } from "zod";
import {
  BrowserProvider,
  WaitCondition,
  ObserveResult,
  ElementHandle,
} from "../interface.js";
import { getPageText, getPageHtml } from "../page-eval.js";

export class PlaywrightLocalProvider implements BrowserProvider {
  private browser!: Browser;
  private page!: Page;
  private headless: boolean;

  constructor(opts: { headless?: boolean } = {}) {
    this.headless = opts.headless ?? false;
  }

  async init(): Promise<void> {
    this.browser = await chromium.launch({ headless: this.headless });
    const context = await this.browser.newContext();
    this.page = await context.newPage();
  }

  async navigate(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 1500));
  }

  async act(_instruction: string): Promise<void> {
    throw new Error(
      "PlaywrightLocalProvider does not support AI-powered act(). " +
        "Use fill() and direct selectors, or switch to browserbase provider.",
    );
  }

  async extract<T>(_schema: ZodSchema<T>, _instruction: string): Promise<T> {
    throw new Error(
      "PlaywrightLocalProvider does not support AI-powered extract(). " +
        "Switch to browserbase provider for production use.",
    );
  }

  async observe(_instruction: string): Promise<ObserveResult[]> {
    throw new Error(
      "PlaywrightLocalProvider does not support observe().",
    );
  }

  async screenshot(): Promise<string> {
    const buffer = await this.page.screenshot();
    return buffer.toString("base64");
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value);
  }

  async waitFor(condition: WaitCondition): Promise<void> {
    switch (condition.type) {
      case "navigation":
        await this.page.waitForURL("**/*");
        break;
      case "selector":
        await this.page.waitForSelector(condition.selector, {
          timeout: condition.timeout ?? 30_000,
        });
        break;
      case "networkIdle":
        await this.page.waitForLoadState("networkidle");
        break;
    }
  }

  async getDebugUrl(): Promise<string | null> {
    // No remote debug URL — user sees the local browser window directly
    return null;
  }

  async url(): Promise<string> {
    return this.page.url();
  }

  async title(): Promise<string> {
    return this.page.title();
  }

  async querySelector(selector: string): Promise<ElementHandle | null> {
    const el = await this.page.$(selector);
    if (!el) return null;
    return { textContent: () => el.textContent() };
  }

  async pageText(): Promise<string> {
    return this.page.evaluate(getPageText);
  }

  async pageHtml(): Promise<string> {
    return this.page.evaluate(getPageHtml);
  }

  async clickSelector(selector: string): Promise<void> {
    await this.page.locator(selector).click({ timeout: 5000 });
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}
