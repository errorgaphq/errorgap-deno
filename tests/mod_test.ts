import { assertEquals } from "@std/assert";
import { Errorgap } from "../mod.ts";

interface Captured {
  path: string;
  body: Record<string, unknown>;
}

function startIngestor(): {
  endpoint: string;
  requests: Captured[];
  close: () => Promise<void>;
} {
  const requests: Captured[] = [];
  const ac = new AbortController();
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, signal: ac.signal, onListen: () => {} },
    async (req: Request): Promise<Response> => {
      let body: Record<string, unknown> = {};
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch { /* leave */ }
      requests.push({ path: new URL(req.url).pathname, body });
      return new Response('{"group_id":"g_1"}', { status: 201 });
    },
  );
  const addr = server.addr as Deno.NetAddr;
  return {
    endpoint: `http://127.0.0.1:${addr.port}`,
    requests,
    close: async () => {
      ac.abort();
      try {
        await server.finished;
      } catch { /* aborted */ }
    },
  };
}

function setup(ing: { endpoint: string }): void {
  Errorgap.init({
    endpoint: ing.endpoint,
    projectSlug: "demo",
    apiKey: "flk_test",
    async: false,
    captureGlobals: false,
  });
  Errorgap.clearBreadcrumbs();
}

Deno.test({
  name: "Errorgap.notify attaches recorded breadcrumbs",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const ing = startIngestor();
    try {
      setup(ing);
      Errorgap.addBreadcrumb("received request", { category: "http" });
      Errorgap.addBreadcrumb("ran query", { category: "db" });
      await Errorgap.notify(new Error("boom"), { sync: true });

      const notice = ing.requests.find((r) => r.path.endsWith("/notices"))!;
      const crumbs = (notice.body.context as Record<string, unknown>)
        .breadcrumbs as Array<
          { message: string }
        >;
      assertEquals(crumbs.map((c) => c.message), [
        "received request",
        "ran query",
      ]);
    } finally {
      await ing.close();
    }
  },
});

Deno.test({
  name: "Errorgap.trackTransaction records spans",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const ing = startIngestor();
    try {
      setup(ing);
      await Errorgap.trackTransaction(
        { method: "GET", path: "/orders/{orderId}", pathRaw: "/orders/7" },
        (spans) => {
          spans.database("SELECT * FROM orders WHERE id = 7", 4, {
            function: "Repo.load",
          });
          spans.external(30, { function: "Gateway.fetch" });
        },
      );
      await Errorgap.flush();
      const txn = ing.requests.find((r) => r.path.endsWith("/transactions"))!;
      assertEquals(txn.body.kind, "web");
      assertEquals(txn.body.path, "/orders/{orderId}");
      assertEquals((txn.body.spans as unknown[]).length, 2);
    } finally {
      await ing.close();
    }
  },
});

Deno.test({
  name: "Errorgap.trackJob delivers a job transaction",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const ing = startIngestor();
    try {
      setup(ing);
      await Errorgap.trackJob("ReceiptJob", (spans) => {
        spans.database("SELECT 1", 2);
      }, { queue: "mailers" });
      await Errorgap.flush();
      const txn = ing.requests.find((r) => r.path.endsWith("/transactions"))!;
      assertEquals(txn.body.kind, "job");
      assertEquals(txn.body.job_class, "ReceiptJob");
      assertEquals(txn.body.queue, "mailers");
    } finally {
      await ing.close();
    }
  },
});

Deno.test({
  name: "Errorgap.log delivers a structured log line",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const ing = startIngestor();
    try {
      setup(ing);
      await Errorgap.log("payment captured", "info", { source: "payments" });
      await Errorgap.flush();
      const log = ing.requests.find((r) => r.path.endsWith("/logs"))!;
      assertEquals(log.body.message, "payment captured");
      assertEquals(log.body.level, "info");
      assertEquals(log.body.source, "payments");
    } finally {
      await ing.close();
    }
  },
});
