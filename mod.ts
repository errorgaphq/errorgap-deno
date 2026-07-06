import { Client, type DeliveryResult } from "./src/client.ts";
import { Configuration, type ConfigurationInput } from "./src/configuration.ts";
import { installGlobalHandlers, uninstallGlobalHandlers } from "./src/handlers.ts";
import type { NoticeContext } from "./src/notice.ts";
import { VERSION } from "./src/version.ts";

export type { ConfigurationInput, Logger } from "./src/configuration.ts";
export type { BacktraceFrame } from "./src/backtrace.ts";
export type { NoticeContext, NoticePayload } from "./src/notice.ts";
export type { DeliveryResult } from "./src/client.ts";
export { Client } from "./src/client.ts";
export { Configuration } from "./src/configuration.ts";
export { VERSION };

let configuration = new Configuration();
const client = new Client(configuration);

export interface InitOptions extends ConfigurationInput {
  /** Hook globalThis 'error' + 'unhandledrejection'. Default: true. */
  captureGlobals?: boolean;
}

function init(options: InitOptions = {}): void {
  const { captureGlobals = true, ...rest } = options;
  configuration = new Configuration(rest);
  client.configure(configuration);
  if (captureGlobals) {
    installGlobalHandlers(client);
  } else {
    uninstallGlobalHandlers();
  }
}

function notify(
  error: unknown,
  options: NoticeContext & { sync?: boolean } = {},
): Promise<DeliveryResult> {
  return client.notify(error, options);
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

export const Errorgap = {
  init,
  notify,
  flush,
  configuration: getConfiguration,
  client: getClient,
  VERSION,
};

export { flush, init, notify };
