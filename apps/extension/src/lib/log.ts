/**
 * Injected dev logger. `log` folds to the real logger in dev builds and to
 * `undefined` in production builds (see `__SLOTHSIGN_DEBUG__` in
 * vite.config.ts), so `log?.debug(...)` call sites — arguments included —
 * are dropped from prod bundles entirely.
 *
 * Deliberately dependency-free so the MAIN-world provider bundle can import
 * it (no zod, no webextension-polyfill).
 */
declare const __SLOTHSIGN_DEBUG__: boolean;

export interface Logger {
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

const PREFIX = "[SlothSign]";

const devLogger: Logger = {
  debug: (...args) => console.log(PREFIX, ...args),
  warn: (...args) => console.warn(PREFIX, ...args),
  error: (...args) => console.error(PREFIX, ...args),
};

export const log: Logger | undefined = __SLOTHSIGN_DEBUG__ ? devLogger : undefined;
