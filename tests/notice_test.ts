import { assertEquals } from "@std/assert";
import { Configuration } from "../src/configuration.ts";
import { buildNotice } from "../src/notice.ts";
import { VERSION } from "../src/version.ts";

function cfg(): Configuration {
  return new Configuration({
    endpoint: "https://e.example.com",
    projectSlug: "demo",
    projectId: "p_1",
    environment: "test",
    release: "1.2.3",
  });
}

Deno.test("notice: captures type and message", () => {
  const notice = buildNotice(new TypeError("boom"), cfg());
  assertEquals(notice.errors[0]?.type, "TypeError");
  assertEquals(notice.errors[0]?.message, "boom");
});

Deno.test("notice: includes notifier identification + runtime", () => {
  const notice = buildNotice(new Error("x"), cfg());
  assertEquals(notice.context.notifier, "errorgap-deno");
  assertEquals(notice.context.notifier_version, VERSION);
  assertEquals(notice.context.environment, "test");
  assertEquals(notice.context.release, "1.2.3");
  assertEquals(notice.context.runtime, "deno");
});

Deno.test("notice: filters sensitive params", () => {
  const notice = buildNotice(new Error("x"), cfg(), {
    params: { username: "alice", password: "hunter2" },
  });
  assertEquals(notice.params.username, "alice");
  assertEquals(notice.params.password, "[FILTERED]");
});

Deno.test("notice: includes project_id", () => {
  const notice = buildNotice(new Error("x"), cfg());
  assertEquals(notice.project_id, "p_1");
});

Deno.test("buildNotice records nested causes and merges frames", () => {
  const root = new Error("db connection refused");
  root.name = "ConnectionError";
  const mid = new Error("failed to load order", { cause: root });
  mid.name = "RepositoryError";
  const top = new Error("checkout failed", { cause: mid });
  top.name = "CheckoutError";

  const notice = buildNotice(top, cfg());
  assertEquals(notice.errors[0].type, "CheckoutError");
  assertEquals(notice.context.causes, [
    { type: "RepositoryError", message: "failed to load order" },
    { type: "ConnectionError", message: "db connection refused" },
  ]);
  notice.errors[0].backtrace.forEach((frame, i) =>
    assertEquals(frame.index, i)
  );
});

Deno.test("buildNotice omits causes when there is no chain", () => {
  const notice = buildNotice(new Error("solo"), cfg());
  assertEquals(notice.context.causes, undefined);
});

Deno.test("buildNotice attaches provided breadcrumbs to context", () => {
  const notice = buildNotice(new Error("x"), cfg(), {
    breadcrumbs: [{
      message: "handled GET /orders",
      timestamp: "2026-01-01T00:00:00.000Z",
    }],
  });
  const crumbs = notice.context.breadcrumbs as Array<{ message: string }>;
  assertEquals(crumbs[0].message, "handled GET /orders");
});
