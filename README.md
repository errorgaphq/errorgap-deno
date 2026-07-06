# @errorgap/deno

Deno notifier for [Errorgap](https://errorgap.com). Errors only in v1.

Requires Deno 1.40+ (for `Deno.serve` / modern HTTP APIs).

## Install

Via [JSR](https://jsr.io/@errorgap/deno):

```ts
import { Errorgap } from "jsr:@errorgap/deno@0.1";
```

Or directly from the source URL:

```ts
import { Errorgap } from "https://raw.githubusercontent.com/errorgaphq/errorgap-deno/v0.1.0/mod.ts";
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

## Configuration reference

| Option | Default | Notes |
|---|---|---|
| `endpoint` | `ERRORGAP_ENDPOINT` or `http://127.0.0.1:3030` | |
| `projectSlug` | `ERRORGAP_PROJECT_SLUG` | **Required** |
| `projectId` | `ERRORGAP_PROJECT_ID` | |
| `apiKey` | `ERRORGAP_API_KEY` | Sent as `x-errorgap-project-key` |
| `environment` | `ERRORGAP_ENVIRONMENT` or `"production"` | |
| `release` | — | |
| `async` | `true` | Fire-and-forget delivery |
| `logger` | `console` | Pass `null` to silence |
| `filterKeys` | `["password", "token", ...]` | Substring, case-insensitive |
| `captureGlobals` | `true` | Install error + rejection listeners |

## Permissions

Needs `--allow-net=<errorgap-host>` to deliver, plus `--allow-env` to
read `ERRORGAP_*` defaults.

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
