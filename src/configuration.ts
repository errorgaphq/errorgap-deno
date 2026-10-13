export interface Logger {
  warn(message: string, ...args: unknown[]): void;
}

import type { FilterKey } from "./filter.ts";
import { detectRelease } from "./release.ts";
import type { NoticePayload } from "./notice.ts";

/**
 * Sees each notice before it is sent. Change it in place or return a
 * replacement; return `false` or `null` to drop it.
 */
export type BeforeNotify = (
  notice: NoticePayload,
) => NoticePayload | false | null | void | Promise<NoticePayload | false | null | void>;

export interface ConfigurationInput {
  endpoint?: string;
  projectSlug?: string;
  projectId?: string;
  apiKey?: string;
  environment?: string;
  release?: string;
  async?: boolean;
  logger?: Logger | null;
  /** Substrings (case-insensitive) or regexps; matching keys are masked at any depth. */
  filterKeys?: FilterKey[];
  beforeNotify?: BeforeNotify;
  /** Environments in which nothing is sent. */
  ignoreEnvironments?: string[];
  /** Seconds allowed for each request to errorgap. Default 5. */
  timeout?: number;
  /** Payloads held for sending; the oldest is dropped when full. Default 100. */
  queueSize?: number;
  /** Root directory used to relativize backtrace source paths. Default cwd. */
  rootDirectory?: string;
  /** Enable APM transaction delivery. Default true. */
  apmEnabled?: boolean;
  /** Fraction (0..1) of transactions to deliver. Default 1. */
  apmSampleRate?: number;
  /** Enable structured log delivery. Default true. */
  logsEnabled?: boolean;
  /** Drop logs below this level (trace<debug<info<warn<error<fatal). Default "info". */
  minimumLogLevel?: string;
  /** Number of breadcrumbs retained and attached to notices. Default 25. */
  maxBreadcrumbs?: number;
}

const DEFAULT_FILTER_KEYS = [
  "password",
  "password_confirmation",
  "token",
  "secret",
  "api_key",
  "authorization",
  "cookie",
];

function envOr(name: string, fallback?: string): string | undefined {
  try {
    const value = Deno.env.get(name);
    if (value && value.length > 0) return value;
  } catch {
    // Env access may be denied without --allow-env; degrade silently.
  }
  return fallback;
}

function ignoredEnvironmentsFromEnv(): string[] {
  return (envOr("ERRORGAP_IGNORE_ENVIRONMENTS") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

function tryCwd(): string | undefined {
  try {
    return Deno.cwd();
  } catch {
    // cwd may be denied without --allow-read; source paths stay absolute.
    return undefined;
  }
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(1, Math.max(0, rate));
}

export class Configuration {
  endpoint: string;
  projectSlug: string | undefined;
  projectId: string | undefined;
  apiKey: string | undefined;
  environment: string;
  release: string | undefined;
  async: boolean;
  logger: Logger | null;
  filterKeys: FilterKey[];
  beforeNotify: BeforeNotify | undefined;
  ignoreEnvironments: string[];
  timeout: number;
  queueSize: number;
  rootDirectory: string | undefined;
  apmEnabled: boolean;
  apmSampleRate: number;
  logsEnabled: boolean;
  minimumLogLevel: string;
  maxBreadcrumbs: number;

  constructor(input: ConfigurationInput = {}) {
    this.endpoint = input.endpoint ??
      envOr("ERRORGAP_ENDPOINT", "http://127.0.0.1:3030")!;
    this.projectSlug = input.projectSlug ?? envOr("ERRORGAP_PROJECT_SLUG");
    this.projectId = input.projectId ?? envOr("ERRORGAP_PROJECT_ID");
    this.apiKey = input.apiKey ?? envOr("ERRORGAP_API_KEY");
    this.environment = input.environment ??
      envOr("ERRORGAP_ENVIRONMENT", "production")!;
    // Unset, the release is the hosting platform's commit variable or the
    // git checkout's HEAD.
    this.release = input.release ?? detectRelease(input.rootDirectory ?? tryCwd());
    this.async = input.async ?? true;
    this.logger = input.logger === undefined ? console : input.logger;
    this.filterKeys = input.filterKeys ?? [...DEFAULT_FILTER_KEYS];
    this.beforeNotify = input.beforeNotify;
    this.ignoreEnvironments = input.ignoreEnvironments ?? ignoredEnvironmentsFromEnv();
    this.timeout = input.timeout ?? 5;
    this.queueSize = input.queueSize ?? 100;
    this.rootDirectory = input.rootDirectory ?? tryCwd();
    this.apmEnabled = input.apmEnabled ?? true;
    this.apmSampleRate = clampRate(input.apmSampleRate ?? 1);
    this.logsEnabled = input.logsEnabled ?? true;
    this.minimumLogLevel = input.minimumLogLevel ?? "info";
    this.maxBreadcrumbs = Math.max(0, Math.trunc(input.maxBreadcrumbs ?? 25));
  }

  ignoredEnvironment(): boolean {
    return this.ignoreEnvironments.includes(this.environment);
  }

  validate(): void {
    if (!this.endpoint || this.endpoint.trim().length === 0) {
      throw new Error("Errorgap endpoint is required");
    }
    if (!this.projectSlug || this.projectSlug.trim().length === 0) {
      throw new Error("Errorgap projectSlug is required");
    }
  }
}
