/**
 * Origin handling: never trust origin fields in request payloads.
 * The origin always comes from the sender URL reported by the browser.
 */
export function extractOrigin(url: string | undefined): string {
  if (!url) return "unknown";
  try {
    return new URL(url).origin;
  } catch {
    return "unknown";
  }
}

export function isAllowedPage(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
