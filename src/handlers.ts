import type { Client } from "./client.ts";
import type { BreadcrumbBuffer } from "./breadcrumbs.ts";

let installed = false;
let errorListener: ((event: ErrorEvent) => void) | null = null;
let rejectionListener: ((event: PromiseRejectionEvent) => void) | null = null;

export interface GlobalHandlerOptions {
  /**
   * After reporting an uncaught error or unhandled rejection, end the
   * process as Deno would have (exit code 1). Defaults to `true`.
   */
  exitOnUncaught?: boolean;
}

/** How long a crashing process waits for its last report. */
const EXIT_FLUSH_MS = 2000;

/**
 * Hook the Deno-native `error` and `unhandledrejection` events on
 * `globalThis`. These fire for any uncaught error or promise rejection
 * in the process.
 *
 * Deno exits as soon as these listeners return, before a report could be
 * sent. So the listeners hold the exit (`preventDefault`), send the report,
 * then print the error and exit with code 1 themselves.
 */
export function installGlobalHandlers(
  client: Client,
  breadcrumbs?: BreadcrumbBuffer,
  options: GlobalHandlerOptions = {},
): void {
  if (installed) return;
  installed = true;
  const snapshot = () => breadcrumbs?.snapshot() ?? [];
  const exitOnUncaught = options.exitOnUncaught ?? true;

  const report = (error: unknown, source: string, event: Event) => {
    const sent = client
      .notify(error, { sync: true, context: { source }, breadcrumbs: snapshot() })
      .catch(() => undefined);
    if (!exitOnUncaught) return;

    event.preventDefault();
    console.error(error);
    const deadline = new Promise((resolve) => setTimeout(resolve, EXIT_FLUSH_MS));
    void Promise.race([sent, deadline]).then(() => Deno.exit(1));
  };

  errorListener = (event: ErrorEvent) => {
    const err = event.error instanceof Error ? event.error : new Error(event.message);
    report(err, "globalThis.error", event);
  };

  rejectionListener = (event: PromiseRejectionEvent) => {
    report(event.reason, "globalThis.unhandledrejection", event);
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
