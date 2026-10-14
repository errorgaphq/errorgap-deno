const ENV_KEYS = [
  "ERRORGAP_RELEASE",
  "SOURCE_VERSION",
  "HEROKU_SLUG_COMMIT",
  "HEROKU_BUILD_COMMIT",
  "RENDER_GIT_COMMIT",
  "RAILWAY_GIT_COMMIT_SHA",
  "VERCEL_GIT_COMMIT_SHA",
  "DENO_DEPLOYMENT_ID",
  "KAMAL_VERSION",
  "GIT_COMMIT",
  "GIT_SHA",
];

/**
 * Works out which commit is running when `release` is not configured, so
 * errors are attributed to a deploy without any setup: the commit variables
 * hosting platforms export, then the checkout's `.git/HEAD`. Only reads what
 * the process was already permitted to read: it never triggers a prompt.
 */
export function detectRelease(rootDirectory: string | undefined): string | undefined {
  for (const key of ENV_KEYS) {
    try {
      const value = Deno.env.get(key)?.trim();
      if (value) return value;
    } catch {
      break; // no --allow-env
    }
  }
  if (!rootDirectory) return undefined;
  try {
    const git = `${rootDirectory}/.git`;
    const head = read(`${git}/HEAD`);
    if (head === undefined) return undefined;
    const ref = head.match(/^ref:\s*(.+)$/)?.[1];
    if (!ref) return sha(head);
    const loose = read(`${git}/${ref}`);
    if (loose !== undefined) return sha(loose);
    const line = read(`${git}/packed-refs`)?.split("\n").find((entry) =>
      entry.trim().endsWith(` ${ref}`)
    );
    return line ? sha(line.trim().split(" ")[0] ?? "") : undefined;
  } catch {
    return undefined;
  }
}

function read(path: string): string | undefined {
  try {
    if (Deno.permissions.querySync({ name: "read", path }).state !== "granted") return undefined;
    return Deno.readTextFileSync(path).trim();
  } catch {
    return undefined;
  }
}

function sha(value: string): string | undefined {
  return /^[0-9a-f]{7,64}$/i.test(value) ? value : undefined;
}
