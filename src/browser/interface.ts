import { ZodSchema } from "zod";

export interface BrowserProvider {
  /** Navigate to a URL */
  navigate(url: string): Promise<void>;

  /** Perform a high-level action described in natural language (AI-powered) */
  act(instruction: string): Promise<void>;

  /** Extract structured data from the current page using a Zod schema */
  extract<T>(schema: ZodSchema<T>, instruction: string): Promise<T>;

  /** Observe the page and return elements matching a natural language description */
  observe(instruction: string): Promise<ObserveResult[]>;

  /** Take a screenshot, return base64-encoded image */
  screenshot(): Promise<string>;

  /** Fill a form field */
  fill(selector: string, value: string): Promise<void>;

  /** Wait for a condition: navigation, selector, or network idle */
  waitFor(condition: WaitCondition): Promise<void>;

  /** Get an interactive debug URL for human-in-the-loop (e.g. 2FA).
   *  Returns null if the provider doesn't support it. */
  getDebugUrl(): Promise<string | null>;

  /** Get the current page URL */
  url(): Promise<string>;

  /** Get the current page title */
  title(): Promise<string>;

  /** Query a CSS selector, return element handle or null */
  querySelector(selector: string): Promise<ElementHandle | null>;

  /** Save browser cookies/storage to a serializable object for session persistence */
  saveSession?(): Promise<SerializedSession>;

  /** Restore a previously saved session */
  loadSession?(session: SerializedSession): Promise<void>;

  /** Get the plain-text content of the current page's main content area.
   *  Tries main/[role="main"] first, falls back to body.
   *  Never uses AI — direct JS evaluation. */
  pageText(): Promise<string>;

  /** Get the inner HTML of the current page's main content area.
   *  Tries main/[role="main"] first, falls back to body.
   *  Never uses AI — direct JS evaluation. */
  pageHtml(): Promise<string>;

  /** Capture the current page as a PDF buffer (full page height, not viewport-limited) */
  pdf?(): Promise<Buffer>;

  /** Click an element by CSS/XPath selector, piercing shadow DOM where needed.
   *  Fallback for when act() silently fails on shadow DOM elements. */
  clickSelector?(selector: string): Promise<void>;

  /** Destroy the browser session and clean up resources */
  close(): Promise<void>;
}

export interface SerializedSession {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite?: string;
  }>;
  savedAt: string;
}

export interface ObserveResult {
  selector: string;
  description: string;
}

export type WaitCondition =
  | { type: "navigation" }
  | { type: "selector"; selector: string; timeout?: number }
  | { type: "networkIdle"; timeout?: number };

export interface ElementHandle {
  textContent(): Promise<string | null>;
}
