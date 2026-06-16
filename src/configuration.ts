export interface Logger {
  warn(message: string, ...args: unknown[]): void;
}

export interface ConfigurationInput {
  endpoint?: string;
  projectSlug?: string;
  projectId?: string;
  apiKey?: string;
  environment?: string;
  release?: string;
  async?: boolean;
  logger?: Logger | null;
  filterKeys?: string[];
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

export class Configuration {
  endpoint: string;
  projectSlug: string | undefined;
  projectId: string | undefined;
  apiKey: string | undefined;
  environment: string;
  release: string | undefined;
  async: boolean;
  logger: Logger | null;
  filterKeys: string[];

  constructor(input: ConfigurationInput = {}) {
    this.endpoint = input.endpoint ?? envOr("ERRORGAP_ENDPOINT", "http://127.0.0.1:3030")!;
    this.projectSlug = input.projectSlug ?? envOr("ERRORGAP_PROJECT_SLUG");
    this.projectId = input.projectId ?? envOr("ERRORGAP_PROJECT_ID");
    this.apiKey = input.apiKey ?? envOr("ERRORGAP_API_KEY");
    this.environment = input.environment ?? envOr("ERRORGAP_ENVIRONMENT", "production")!;
    this.release = input.release;
    this.async = input.async ?? true;
    this.logger = input.logger === undefined ? console : input.logger;
    this.filterKeys = input.filterKeys ?? [...DEFAULT_FILTER_KEYS];
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
