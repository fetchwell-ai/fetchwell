/**
 * Browser-side evaluation functions for extracting page content.
 * Shared across all BrowserProvider implementations.
 *
 * Each function is passed directly to page.evaluate(), so it must be
 * self-contained (no closure over outer-scope variables).
 */

/**
 * Convert all fixed and sticky positioned elements to relative so they do not
 * overlap page content in PDF output. Fixed/sticky elements render on top of
 * content in Chromium's print/PDF mode, obscuring medical data.
 *
 * Call this via page.evaluate(stripFixedElements) immediately before page.pdf().
 */
export const stripFixedElements = (): void => {
  document.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const pos = getComputedStyle(el).position;
    if (pos === "fixed" || pos === "sticky") {
      el.style.position = "relative";
    }
  });
};

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
