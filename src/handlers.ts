import type { Client } from "./client.ts";
import type { BreadcrumbBuffer } from "./breadcrumbs.ts";

let installed = false;
let errorListener: ((event: ErrorEvent) => void) | null = null;
let rejectionListener: ((event: PromiseRejectionEvent) => void) | null = null;

/**
 * Hook the Deno-native `error` and `unhandledrejection` events on
 * `globalThis`. These fire for any uncaught error or promise rejection
 * in the process.
 */
export function installGlobalHandlers(
  client: Client,
  breadcrumbs?: BreadcrumbBuffer,
): void {
  if (installed) return;
  installed = true;
  const snapshot = () => breadcrumbs?.snapshot() ?? [];

  errorListener = (event: ErrorEvent) => {
    const err = event.error instanceof Error
      ? event.error
      : new Error(event.message);
    void client.notify(err, {
      context: { source: "globalThis.error" },
      breadcrumbs: snapshot(),
    });
  };

  rejectionListener = (event: PromiseRejectionEvent) => {
    void client.notify(event.reason, {
      context: { source: "globalThis.unhandledrejection" },
      breadcrumbs: snapshot(),
    });
  };

  globalThis.addEventListener("error", errorListener);
  globalThis.addEventListener("unhandledrejection", rejectionListener);
}

export function uninstallGlobalHandlers(): void {
  if (!installed) return;
  if (errorListener) globalThis.removeEventListener("error", errorListener);
  if (rejectionListener) {
    globalThis.removeEventListener("unhandledrejection", rejectionListener);
  }
  errorListener = null;
  rejectionListener = null;
  installed = false;
}
