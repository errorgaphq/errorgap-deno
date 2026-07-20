# @errorgap/deno

Deno notifier for [Errorgap](https://errorgap.com). Reports errors (with
nested causes and source excerpts), APM transactions, structured logs, and
breadcrumbs.

Requires Deno 1.40+ (for `Deno.serve` / modern HTTP APIs).

## Install

Via [JSR](https://jsr.io/@errorgap/deno):

```ts
import { Errorgap } from "jsr:@errorgap/deno@0.2";
```

Or directly from the source URL:

```ts
import { Errorgap } from "https://raw.githubusercontent.com/errorgaphq/errorgap-deno/v0.2.0/mod.ts";
```

## Configure

```ts
import { Errorgap } from "@errorgap/deno";

Errorgap.init({
  endpoint:    Deno.env.get("ERRORGAP_ENDPOINT")!,
  projectSlug: Deno.env.get("ERRORGAP_PROJECT_SLUG")!,
  apiKey:      Deno.env.get("ERRORGAP_API_KEY"),
  environment: Deno.env.get("DENO_ENV") ?? "production",
});
```

`init` reads `ERRORGAP_*` env vars when fields are omitted (requires
`--allow-env`). By default it hooks `globalThis.error` and
`globalThis.unhandledrejection`; pass `captureGlobals: false` to skip.

## Manual notification

```ts
try {
  await risky();
} catch (err) {
  await Errorgap.notify(err, { context: { component: "billing" } });
  throw err;
}
```

`notify` returns a `DeliveryResult` (`status`, `body`, `error`, `queued`).
The SDK never throws.

### Nested causes & source excerpts

`notify` walks the ES2022 `error.cause` chain, records each cause under
`context.causes`, and merges every link's frames into one backtrace. When
`--allow-read` is granted, each in-app frame carries a source excerpt read
straight from disk (Deno runs TypeScript directly, so frames point at your
original source).

```ts
throw new Error("could not settle order", { cause: gatewayError });
```

## Breadcrumbs

Record diagnostic trail entries that attach to subsequent notices:

```ts
Errorgap.addBreadcrumb("received request", { category: "http" });
Errorgap.addBreadcrumb("loaded order", { category: "db", data: { id: 7 } });
// ...later
await Errorgap.notify(err); // includes the breadcrumbs above
```

The buffer keeps the most recent `maxBreadcrumbs` entries (default 25).
`Errorgap.clearBreadcrumbs()` empties it.

## Structured logs

```ts
await Errorgap.log("payment captured", "info", { source: "payments" });
```

Levels are `trace < debug < info < warn < error < fatal`; anything below
`minimumLogLevel` (default `info`) is dropped locally without a request.

## APM

Time an HTTP interaction and record DB / outbound-HTTP spans:

```ts
await Errorgap.trackTransaction(
  { method: "GET", path: "/orders/{orderId}", pathRaw: "/orders/7", statusCode: 200 },
  (spans) => {
    spans.database("SELECT * FROM orders WHERE id = 7", 4, { function: "Repo.load" });
    spans.external(30, { function: "Gateway.fetch" });
  },
);
```

`path` is the normalized route template used for grouping; `pathRaw` is the
concrete request path. For background work:

```ts
await Errorgap.trackJob("ReceiptJob", (spans) => {
  spans.database("SELECT 1", 2);
}, { queue: "mailers" });
```

Or deliver a pre-built transaction directly with `Errorgap.notifyTransaction`.
Set `apmEnabled: false` to disable, or `apmSampleRate` (0..1) to sample.

## Configuration reference

| Option | Default | Notes |
|---|---|---|
| `endpoint` | `ERRORGAP_ENDPOINT` or `http://127.0.0.1:3030` | |
| `projectSlug` | `ERRORGAP_PROJECT_SLUG` | **Required** |
| `projectId` | `ERRORGAP_PROJECT_ID` | |
| `apiKey` | `ERRORGAP_API_KEY` | Sent as `x-errorgap-project-key` |
| `environment` | `ERRORGAP_ENVIRONMENT` or `"production"` | |
| `release` | `ERRORGAP_RELEASE` | |
| `async` | `true` | Fire-and-forget delivery |
| `logger` | `console` | Pass `null` to silence |
| `filterKeys` | `["password", "token", ...]` | Substring, case-insensitive |
| `rootDirectory` | `Deno.cwd()` | Relativizes backtrace source paths |
| `apmEnabled` | `true` | Deliver APM transactions |
| `apmSampleRate` | `1` | Fraction (0..1) of transactions delivered |
| `logsEnabled` | `true` | Deliver structured logs |
| `minimumLogLevel` | `"info"` | Drop logs below this level |
| `maxBreadcrumbs` | `25` | Breadcrumbs retained per notice |
| `captureGlobals` | `true` | Install error + rejection listeners |

## Permissions

Needs `--allow-net=<errorgap-host>` to deliver, `--allow-env` to read
`ERRORGAP_*` defaults, and `--allow-read` to attach source excerpts to
backtraces. All degrade gracefully when a permission is withheld.

## Graceful flush

```ts
await Errorgap.flush();
```

## Development

```sh
deno task test
```

## License

MIT.
