import { BrowserProvider } from "./interface.js";
import { StagehandLocalProvider } from "./providers/stagehand-local.js";

export type ProviderType = "stagehand-local";

export async function createBrowserProvider(
  type?: ProviderType,
  apiKey?: string,
): Promise<BrowserProvider> {
  const provider = new StagehandLocalProvider({
    headless: process.env.HEADLESS === "true",
    apiKey,
  });

  await provider.init();
  return provider;
}

export type { BrowserProvider } from "./interface.js";
export type { ObserveResult, WaitCondition, ElementHandle } from "./interface.js";
