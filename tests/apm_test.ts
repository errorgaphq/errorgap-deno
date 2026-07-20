import { assertEquals } from "@std/assert";
import { Configuration } from "../src/configuration.ts";
import {
  databaseSpan,
  externalSpan,
  normalizeSql,
  SpanCollector,
  transactionPayload,
} from "../src/apm.ts";

Deno.test("normalizeSql replaces literals and collapses whitespace", () => {
  assertEquals(
    normalizeSql("SELECT * FROM orders WHERE id = 42 AND name = 'alice'"),
    "SELECT * FROM orders WHERE id = ? AND name = ?",
  );
  assertEquals(normalizeSql("SELECT\n  1\n  FROM   t"), "SELECT ? FROM t");
});

Deno.test("databaseSpan builds a normalized db span", () => {
  const span = databaseSpan("SELECT * FROM t WHERE id = 7", 12.5, {
    file: "src/repo.ts",
    line: 20,
    function: "OrderRepo.load",
  });
  assertEquals(span.kind, "db");
  assertEquals(span.sql, "SELECT * FROM t WHERE id = ?");
  assertEquals(span.durationMs, 12.5);
  assertEquals(span.function, "OrderRepo.load");
});

Deno.test("externalSpan omits sql", () => {
  const span = externalSpan(88, { function: "PaymentGateway.charge" });
  assertEquals(span.kind, "http");
  assertEquals(span.sql, undefined);
});

Deno.test("transactionPayload maps a web transaction with spans", () => {
  const cfg = new Configuration({
    endpoint: "https://e.example.com",
    projectSlug: "demo",
    environment: "production",
  });
  const collector = new SpanCollector();
  collector.database("SELECT 1", 3, { function: "Repo.q" });
  collector.external(50, { function: "Api.call" });
  const payload = transactionPayload(
    {
      kind: "web",
      method: "POST",
      path: "/orders/{orderId}",
      pathRaw: "/orders/123",
      statusCode: 201,
      durationMs: 120,
      spans: collector.snapshot(),
    },
    cfg,
  );
  assertEquals(payload.kind, "web");
  assertEquals(payload.path, "/orders/{orderId}");
  assertEquals(payload.path_raw, "/orders/123");
  assertEquals(payload.status_code, 201);
  assertEquals(payload.environment, "production");
  const spans = payload.spans as Array<Record<string, unknown>>;
  assertEquals(spans.length, 2);
  assertEquals(spans[0].kind, "db");
  assertEquals(spans[0].sql, "SELECT ?");
  assertEquals(spans[0].fn_name, "Repo.q");
});

Deno.test("transactionPayload maps a background job transaction", () => {
  const cfg = new Configuration({
    endpoint: "https://e.example.com",
    projectSlug: "demo",
  });
  const payload = transactionPayload(
    { kind: "job", jobClass: "ReceiptJob", queue: "mailers", durationMs: 40 },
    cfg,
  );
  assertEquals(payload.kind, "job");
  assertEquals(payload.job_class, "ReceiptJob");
  assertEquals(payload.queue, "mailers");
});
