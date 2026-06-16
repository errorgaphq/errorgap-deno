import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Configuration } from "../src/configuration.ts";

Deno.test("Configuration: defaults when nothing provided", () => {
  const cfg = new Configuration();
  assertEquals(cfg.environment, "production");
  assertEquals(cfg.async, true);
  assertEquals(cfg.filterKeys.includes("password"), true);
});

Deno.test("Configuration: validate throws when projectSlug missing", () => {
  const cfg = new Configuration({ endpoint: "https://e.example.com" });
  assertThrows(() => cfg.validate(), Error, "projectSlug");
});

Deno.test("Configuration: validate throws when endpoint missing", () => {
  const cfg = new Configuration({ endpoint: "", projectSlug: "demo" });
  assertThrows(() => cfg.validate(), Error, "endpoint");
});

Deno.test("Configuration: validate passes with both", () => {
  const cfg = new Configuration({
    endpoint: "https://e.example.com",
    projectSlug: "demo",
  });
  cfg.validate();
});
