import { Client, type DeliveryResult, type LogOptions } from "./src/client.ts";
import { Configuration, type ConfigurationInput } from "./src/configuration.ts";
import {
  installGlobalHandlers,
  uninstallGlobalHandlers,
} from "./src/handlers.ts";
import { BreadcrumbBuffer, type BreadcrumbInput } from "./src/breadcrumbs.ts";
import { SpanCollector, type Transaction } from "./src/apm.ts";
import type { NoticeContext } from "./src/notice.ts";
import { VERSION } from "./src/version.ts";

export type { ConfigurationInput, Logger } from "./src/configuration.ts";
export type { BacktraceFrame, SourceExcerpt } from "./src/backtrace.ts";
export type {
  NoticeCause,
  NoticeContext,
  NoticePayload,
} from "./src/notice.ts";
export type { DeliveryResult, LogOptions } from "./src/client.ts";
export type { Breadcrumb, BreadcrumbInput } from "./src/breadcrumbs.ts";
export type { Span, SpanLocation, Transaction } from "./src/apm.ts";
export { Client } from "./src/client.ts";
export { Configuration } from "./src/configuration.ts";
export {
  databaseSpan,
  externalSpan,
  normalizeSql,
  SpanCollector,
} from "./src/apm.ts";
export { BreadcrumbBuffer } from "./src/breadcrumbs.ts";
export { VERSION };

let configuration = new Configuration();
const client = new Client(configuration);
let breadcrumbs = new BreadcrumbBuffer(configuration.maxBreadcrumbs);

export interface InitOptions extends ConfigurationInput {
  /** Hook globalThis 'error' + 'unhandledrejection'. Default: true. */
  captureGlobals?: boolean;
}

function init(options: InitOptions = {}): void {
  const { captureGlobals = true, ...rest } = options;
  configuration = new Configuration(rest);
  client.configure(configuration);
  breadcrumbs = new BreadcrumbBuffer(configuration.maxBreadcrumbs);
  if (captureGlobals) {
    installGlobalHandlers(client, breadcrumbs);
  } else {
    uninstallGlobalHandlers();
  }
}

function notify(
  error: unknown,
  options: NoticeContext & { sync?: boolean } = {},
): Promise<DeliveryResult> {
  return client.notify(error, {
    breadcrumbs: breadcrumbs.snapshot(),
    ...options,
  });
}

/** Record a diagnostic breadcrumb attached to subsequent notices. */
function addBreadcrumb(message: string, input: BreadcrumbInput = {}): void {
  breadcrumbs.add(message, input);
}

function clearBreadcrumbs(): void {
  breadcrumbs.clear();
}

/** Deliver a structured log line at the given level. */
function log(
  message: string,
  level = "info",
  options: LogOptions = {},
): Promise<DeliveryResult> {
  return client.notifyLog(message, level, options);
}

/** Deliver an APM transaction (HTTP interaction or background job). */
function notifyTransaction(
  transaction: Transaction,
  options: { sync?: boolean } = {},
): Promise<DeliveryResult> {
  return client.notifyTransaction(transaction, options);
}

/**
 * Time an HTTP interaction and deliver it as a transaction. The callback
 * receives a `SpanCollector` for recording DB/HTTP spans.
 */
async function trackTransaction<T>(
  meta: Omit<Transaction, "durationMs" | "spans" | "kind"> & { kind?: string },
  operation: (spans: SpanCollector) => Promise<T> | T,
): Promise<T> {
  const spans = new SpanCollector();
  const startedAt = new Date().toISOString();
  const start = Date.now();
  try {
    return await operation(spans);
  } finally {
    void notifyTransaction({
      kind: meta.kind ?? "web",
      ...meta,
      occurredAt: meta.occurredAt ?? startedAt,
      durationMs: Date.now() - start,
      spans: spans.snapshot(),
    });
  }
}

/**
 * Time a background job and deliver it as a `job` transaction. The callback
 * receives a `SpanCollector` for recording DB/HTTP spans.
 */
async function trackJob<T>(
  jobClass: string,
  operation: (spans: SpanCollector) => Promise<T> | T,
  meta: { queue?: string; environment?: string } = {},
): Promise<T> {
  const spans = new SpanCollector();
  const startedAt = new Date().toISOString();
  const start = Date.now();
  try {
    return await operation(spans);
  } finally {
    void notifyTransaction({
      kind: "job",
      jobClass,
      queue: meta.queue ?? "default",
      environment: meta.environment,
      occurredAt: startedAt,
      durationMs: Date.now() - start,
      spans: spans.snapshot(),
    });
  }
}

function flush(): Promise<void> {
  return client.flush();
}

function getConfiguration(): Configuration {
  return configuration;
}

function getClient(): Client {
  return client;
}

export const Errorgap: {
  init: typeof init;
  notify: typeof notify;
  addBreadcrumb: typeof addBreadcrumb;
  clearBreadcrumbs: typeof clearBreadcrumbs;
  log: typeof log;
  notifyTransaction: typeof notifyTransaction;
  trackTransaction: typeof trackTransaction;
  trackJob: typeof trackJob;
  flush: typeof flush;
  configuration: typeof getConfiguration;
  client: typeof getClient;
  VERSION: string;
} = {
  init,
  notify,
  addBreadcrumb,
  clearBreadcrumbs,
  log,
  notifyTransaction,
  trackTransaction,
  trackJob,
  flush,
  configuration: getConfiguration,
  client: getClient,
  VERSION,
};

export {
  addBreadcrumb,
  clearBreadcrumbs,
  flush,
  init,
  log,
  notify,
  notifyTransaction,
  trackJob,
  trackTransaction,
};
