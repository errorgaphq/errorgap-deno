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
