export interface SourceExcerpt {
  start_line: number;
  lines: string[];
}

export interface BacktraceFrame {
  file?: string;
  line?: number;
  column?: number;
  function?: string;
  in_app?: boolean;
  index: number;
  source?: SourceExcerpt;
}

const V8_AT = /^\s*at\s+(?:(.*?)\s+\()?(.+?)(?::(\d+))?(?::(\d+))?\)?$/;

const SOURCE_CONTEXT_RADIUS = 6;
const MAX_SOURCE_LINE_CHARS = 400;
const MAX_SOURCE_FILE_BYTES = 2 * 1024 * 1024;

/** Cache of file line arrays, keyed by resolved path, for one notice build. */
const fileCache = new Map<string, string[] | null>();

/**
 * Parse a V8-style `Error.stack` into Errorgap frames. Because Deno executes
 * TypeScript directly, frame locations point at the original source files, so
 * each frame's source excerpt is read straight from disk (when `--allow-read`
 * is granted; otherwise the excerpt is silently skipped).
 */
export function parseBacktrace(
  error: Error,
  rootDirectory?: string,
): BacktraceFrame[] {
  const stack = typeof error.stack === "string" ? error.stack : "";
  if (!stack) return [];
  fileCache.clear();

  const lines = stack.split("\n");
  const frames: BacktraceFrame[] = [];
  let index = 0;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("at ")) continue;
    const m = trimmed.match(V8_AT);
    if (!m) continue;

    const fnName = m[1];
    const location = (m[2] ?? "").replace(/^file:\/\//, "");
    const line = m[3] ? Number(m[3]) : undefined;
    const column = m[4] ? Number(m[4]) : undefined;

    const frame: BacktraceFrame = {
      file: displayPath(location, rootDirectory),
      line,
      column,
      function: fnName || undefined,
      in_app: isInApp(location),
      index: index++,
    };

    const source = sourceExcerpt(location, line, rootDirectory);
    if (source) frame.source = source;

    frames.push(frame);
  }

  fileCache.clear();
  return frames;
}

function isInApp(file: string): boolean {
  if (!file) return false;
  // Non-local specifiers: Deno internals (ext:), Node builtins (node:), and
  // remote modules fetched over http(s)/jsr/npm all live outside the app.
  if (/^(?:ext|node|https?|jsr|npm):/.test(file)) return false;
  if (file.includes("/node_modules/")) return false;
  if (file.includes("/std/")) return false;
  if (isCachedDependency(file)) return false;
  return true;
}

/**
 * Deno materializes remote and npm dependencies onto disk under DENO_DIR, so
 * their stack frames appear as ordinary local paths. Classify those as vendor.
 */
function isCachedDependency(file: string): boolean {
  if (file.includes("/registry.npmjs.org/")) return true; // npm cache layout
  const cache = denoCacheDir();
  return cache !== undefined && file.startsWith(cache);
}

function denoCacheDir(): string | undefined {
  try {
    const dir = Deno.env.get("DENO_DIR");
    if (dir && dir.length > 0) return dir.endsWith("/") ? dir : dir + "/";
  } catch {
    // Env access may be denied without --allow-env; rely on path markers only.
  }
  return undefined;
}

/** Strip the app root prefix for a cleaner in-app display path. */
function displayPath(file: string, root?: string): string {
  if (!file) return file;
  if (root) {
    const normalized = root.endsWith("/") ? root : root + "/";
    if (file.startsWith(normalized)) return file.slice(normalized.length);
  }
  return file;
}

function sourceExcerpt(
  file: string,
  line: number | undefined,
  root?: string,
): SourceExcerpt | undefined {
  if (!file || !line || line < 1) return undefined;
  // Only local files carry readable source; remote modules keep their URL.
  if (/^(?:ext|node|https?|jsr|npm):/.test(file)) return undefined;

  const contents = readSourceLines(resolvePath(file, root));
  if (!contents || line > contents.length) return undefined;

  const startLine = Math.max(1, line - SOURCE_CONTEXT_RADIUS);
  const endLine = Math.min(contents.length, line + SOURCE_CONTEXT_RADIUS);
  return {
    start_line: startLine,
    lines: contents.slice(startLine - 1, endLine).map((l) =>
      l.slice(0, MAX_SOURCE_LINE_CHARS)
    ),
  };
}

function resolvePath(file: string, root?: string): string {
  if (file.startsWith("/") || /^[A-Za-z]:[\\/]/.test(file)) return file;
  if (root) return (root.endsWith("/") ? root : root + "/") + file;
  return file;
}

function readSourceLines(path: string): string[] | null {
  if (fileCache.has(path)) return fileCache.get(path) ?? null;
  let lines: string[] | null = null;
  try {
    const stat = Deno.statSync(path);
    if (stat.isFile && stat.size <= MAX_SOURCE_FILE_BYTES) {
      lines = Deno.readTextFileSync(path).split(/\r?\n/);
    }
  } catch {
    // NotFound, PermissionDenied (no --allow-read), etc. — degrade to no source.
    lines = null;
  }
  fileCache.set(path, lines);
  return lines;
}
