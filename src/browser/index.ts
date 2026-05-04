import { BrowserProvider } from "./interface.js";
import { StagehandLocalProvider } from "./providers/stagehand-local.js";
import { PlaywrightLocalProvider } from "./providers/playwright-local.js";

export type ProviderType = "stagehand-local" | "local";

export async function createBrowserProvider(
  type?: ProviderType,
): Promise<BrowserProvider> {
  const providerType =
    type ?? (process.env.BROWSER_PROVIDER as ProviderType) ?? "stagehand-local";

  let provider: BrowserProvider & { init(): Promise<void> };

  switch (providerType) {
    case "stagehand-local":
      provider = new StagehandLocalProvider({
        headless: process.env.HEADLESS === "true",
      });
      break;
    case "local":
      provider = new PlaywrightLocalProvider({
        headless: process.env.HEADLESS === "true",
      });
      break;
    default:
      throw new Error(`Unknown browser provider: ${providerType}`);
  }

  await provider.init();
  return provider;
}

export type { BrowserProvider } from "./interface.js";
export type { ObserveResult, WaitCondition, ElementHandle } from "./interface.js";
