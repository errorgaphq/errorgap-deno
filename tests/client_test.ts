import { assertEquals } from "@std/assert";
import { Client } from "../src/client.ts";
import { Configuration } from "../src/configuration.ts";

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function startIngestor(): {
  endpoint: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
} {
  const requests: CapturedRequest[] = [];
  const ac = new AbortController();
  const server = Deno.serve({
    hostname: "127.0.0.1",
    port: 0,
    signal: ac.signal,
    onListen: () => {},
  }, async (req: Request): Promise<Response> => {
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const text = await req.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch { /* leave as text */ }
    requests.push({ url: req.url, method: req.method, headers, body });
    return new Response('{"group_id":"g_1"}', {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  });
  const addr = server.addr as Deno.NetAddr;
  const endpoint = `http://127.0.0.1:${addr.port}`;

  return {
    endpoint,
    requests,
    close: async () => {
      ac.abort();
      try {
        await server.finished;
      } catch { /* aborted */ }
    },
  };
}

Deno.test({
  name: "Client: POSTs to /api/projects/:slug/notices with canonical headers",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const ing = await startIngestor();
    try {
      const cfg = new Configuration({
        endpoint: ing.endpoint,
        projectSlug: "demo",
        apiKey: "flk_test",
        async: false,
      });
      const client = new Client(cfg);
      const result = await client.notify(new Error("boom"), { sync: true });
      assertEquals(result.status, 201);
      assertEquals(ing.requests.length, 1);
      const req = ing.requests[0];
      assertEquals(req.method, "POST");
      assertEquals(new URL(req.url).pathname, "/api/projects/demo/notices");
      assertEquals(req.headers["x-errorgap-project-key"], "flk_test");
      assertEquals(
        req.headers["user-agent"]?.startsWith("errorgap-deno/"),
        true,
      );
    } finally {
      await ing.close();
    }
  },
});

Deno.test({
  name: "Client: returns error result when endpoint missing",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const cfg = new Configuration({
      endpoint: "",
      projectSlug: "demo",
      logger: null,
    });
    const client = new Client(cfg);
    const result = await client.notify(new Error("x"), { sync: true });
    assertEquals(typeof result.error !== "undefined", true);
  },
});

Deno.test({
  name: "Client: POSTs a structured log to /logs",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const ing = await startIngestor();
    try {
      const client = new Client(
        new Configuration({
          endpoint: ing.endpoint,
          projectSlug: "demo",
          apiKey: "flk_test",
          async: false,
        }),
      );
      const result = await client.notifyLog("gateway timeout", "error", {
        source: "payments",
        sync: true,
      });
      assertEquals(result.status, 201);
      const req = ing.requests[0];
      assertEquals(new URL(req.url).pathname, "/api/projects/demo/logs");
      const body = req.body as Record<string, unknown>;
      assertEquals(body.message, "gateway timeout");
      assertEquals(body.level, "error");
      assertEquals(body.source, "payments");
    } finally {
      await ing.close();
    }
  },
});

Deno.test({
  name: "Client: drops logs below the minimum level",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const ing = await startIngestor();
    try {
      const client = new Client(
        new Configuration({
          endpoint: ing.endpoint,
          projectSlug: "demo",
          async: false,
          minimumLogLevel: "warn",
        }),
      );
      const result = await client.notifyLog("chatty", "info", { sync: true });
      assertEquals(result.status, 204);
      assertEquals(ing.requests.length, 0);
    } finally {
      await ing.close();
    }
  },
});

Deno.test({
  name: "Client: POSTs an APM transaction to /transactions",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const ing = await startIngestor();
    try {
      const client = new Client(
        new Configuration({
          endpoint: ing.endpoint,
          projectSlug: "demo",
          apiKey: "flk_test",
          async: false,
        }),
      );
      const result = await client.notifyTransaction(
        {
          kind: "web",
          method: "GET",
          path: "/orders/{id}",
          pathRaw: "/orders/1",
          durationMs: 10,
        },
        { sync: true },
      );
      assertEquals(result.status, 201);
      const req = ing.requests[0];
      assertEquals(
        new URL(req.url).pathname,
        "/api/projects/demo/transactions",
      );
      const body = req.body as Record<string, unknown>;
      assertEquals(body.kind, "web");
      assertEquals(body.path, "/orders/{id}");
      assertEquals(body.path_raw, "/orders/1");
    } finally {
      await ing.close();
    }
  },
});

Deno.test({
  name: "Client: skips transactions when APM is disabled",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const ing = await startIngestor();
    try {
      const client = new Client(
        new Configuration({
          endpoint: ing.endpoint,
          projectSlug: "demo",
          async: false,
          apmEnabled: false,
        }),
      );
      const result = await client.notifyTransaction({ durationMs: 5 }, {
        sync: true,
      });
      assertEquals(result.status, 204);
      assertEquals(ing.requests.length, 0);
    } finally {
      await ing.close();
    }
  },
});
