import { assert, assertEquals, assertInstanceOf } from "@std/assert";
import { Client } from "../src/client.ts";
import { Configuration } from "../src/configuration.ts";
import { RateLimitedError, retryable } from "../src/delivery.ts";
import { filterParams } from "../src/filter.ts";

type Scripted = [number, Record<string, string>?];

/** Answers each request with the next scripted [status, headers] pair. */
function stub(responses: Scripted[]) {
  // deno-lint-ignore no-explicit-any
  const bodies: any[] = [];
  const ac = new AbortController();
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, signal: ac.signal, onListen: () => {} },
    async (req: Request): Promise<Response> => {
      bodies.push(await req.json());
      const [status, headers] = responses.length > 1 ? responses.shift()! : responses[0]!;
      return new Response("{}", { status, headers });
    },
  );
  const endpoint = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}`;
  return {
    endpoint,
    bodies,
    close: async () => {
      ac.abort();
      await server.finished;
    },
  };
}

function client(endpoint: string, overrides: Record<string, unknown> = {}): Client {
  return new Client(
    new Configuration({ endpoint, projectSlug: "demo", logger: null, ...overrides }),
  );
}

Deno.test("queued payloads are sent and flush waits for them", async () => {
  const { endpoint, bodies, close } = stub([[201]]);
  const sdk = client(endpoint);
  for (let n = 0; n < 6; n++) void sdk.notify(new Error(`e${n}`));
  await new Promise((resolve) => setTimeout(resolve, 10));
  await sdk.flush();
  assertEquals(bodies.length, 6);
  await close();
});

Deno.test("a 429 pauses sending for Retry-After", async () => {
  const { endpoint, bodies, close } = stub([[429, { "retry-after": "120" }]]);
  const sdk = client(endpoint);
  assertEquals((await sdk.notify(new Error("one"), { sync: true })).status, 429);
  assertInstanceOf((await sdk.notify(new Error("two"), { sync: true })).error, RateLimitedError);
  assertEquals(bodies.length, 1);
  await close();
});

Deno.test("network failures and 5xx are retried, 4xx and rate limits are not", () => {
  assert(retryable({ status: 500 }));
  assert(retryable({ error: new Error("refused") }));
  assert(!retryable({ status: 422 }));
  assert(!retryable({ status: 429 }));
});

Deno.test("notices mask nested keys, carry the user and survive unserializable params", async () => {
  const { endpoint, bodies, close } = stub([[201]]);
  const loop: Record<string, unknown> = {};
  loop.self = loop;
  await client(endpoint, { filterKeys: ["password", /^ssn$/] }).notify(new Error("x"), {
    sync: true,
    user: { id: 7, email: "ada@example.com" },
    params: { users: [{ password: "p", ssn: "1" }], loop, big: 10n },
  });
  assertEquals(bodies[0].params.users[0], { password: "[FILTERED]", ssn: "[FILTERED]" });
  assertEquals(bodies[0].params.loop.self, "[CIRCULAR]");
  assertEquals(bodies[0].session, { user_id: "7", user_email: "ada@example.com" });
  JSON.stringify(filterParams({ loop }, []));
  await close();
});

Deno.test("beforeNotify can drop or change a notice; ignored environments send nothing", async () => {
  const { endpoint, bodies, close } = stub([[201]]);
  const dropped = await client(endpoint, { beforeNotify: () => false }).notify(new Error("a"), {
    sync: true,
  });
  assertEquals(dropped.body, "dropped by beforeNotify");
  await client(endpoint, {
    // deno-lint-ignore no-explicit-any
    beforeNotify: (notice: any) => {
      notice.context.team = "billing";
    },
  }).notify(new Error("b"), { sync: true });
  await client(endpoint, { environment: "test", ignoreEnvironments: ["test"] }).notify(
    new Error("c"),
    { sync: true },
  );
  assertEquals(bodies.length, 1);
  assertEquals(bodies[0].context.team, "billing");
  await close();
});
