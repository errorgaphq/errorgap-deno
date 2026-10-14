import { assert, assertEquals } from "@std/assert";
import { Client } from "../src/client.ts";
import { Configuration } from "../src/configuration.ts";

Deno.test("remote settings stop a switched-off kind and stay on when unreadable", async () => {
  const seen: string[] = [];
  const ac = new AbortController();
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, signal: ac.signal, onListen: () => {} },
    async (req: Request): Promise<Response> => {
      seen.push(`${req.method} ${new URL(req.url).pathname}`);
      await req.text();
      if (req.method === "GET") {
        return Response.json({ errors_enabled: false, apm_enabled: true, poll_interval_seconds: 600 });
      }
      return new Response("{}", { status: 201 });
    },
  );
  const endpoint = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}`;
  const sdk = new Client(
    new Configuration({ endpoint, projectSlug: "demo", logger: null, remoteSettings: true }),
  );
  assert(await sdk.remote.refresh());
  assertEquals(seen[0], "GET /api/projects/demo/config");
  await sdk.notify(new Error("x"), { sync: true });
  assert(!seen.some((line) => line.startsWith("POST")));
  sdk.remote.stop();

  const off = new Client(
    new Configuration({ endpoint, projectSlug: "demo", logger: null, remoteSettings: false }),
  );
  assert(off.remote.enabled("errors"));
  ac.abort();
  await server.finished;
});
