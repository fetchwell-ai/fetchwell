/**
 * Browser-side evaluation functions for extracting page content.
 * Shared across all BrowserProvider implementations.
 *
 * Each function is passed directly to page.evaluate(), so it must be
 * self-contained (no closure over outer-scope variables).
 */

export const getPageText = (): string => {
  const el =
    document.querySelector("main") ??
    document.querySelector("[role='main']") ??
    document.querySelector("#mainContent") ??
    document.body;
  return (el as HTMLElement).innerText ?? "";
};

export const getPageHtml = (): string => {
  const el =
    document.querySelector("main") ??
    document.querySelector("[role='main']") ??
    document.querySelector("#mainContent") ??
    document.body;
  return (el as HTMLElement).innerHTML ?? "";
};
