import { assertEquals } from "@std/assert";
import { filterParams } from "../src/filter.ts";

const DEFAULTS = ["password", "token", "secret", "api_key", "authorization", "cookie"];

Deno.test("filter: masks filtered keys", () => {
  const out = filterParams(
    { username: "alice", password: "hunter2", access_token: "x" },
    DEFAULTS,
  );
  assertEquals(out.username, "alice");
  assertEquals(out.password, "[FILTERED]");
  assertEquals(out.access_token, "[FILTERED]");
});

Deno.test("filter: recurses into nested objects", () => {
  const out = filterParams(
    { user: { name: "alice", api_key: "x" } },
    DEFAULTS,
  );
  const user = out.user as Record<string, unknown>;
  assertEquals(user.name, "alice");
  assertEquals(user.api_key, "[FILTERED]");
});

Deno.test("filter: case-insensitive", () => {
  const out = filterParams({ Authorization: "Bearer xyz" }, DEFAULTS);
  assertEquals(out.Authorization, "[FILTERED]");
});
