import { assert, assertEquals } from "@std/assert";
import { logLevelRank, normalizeLogLevel } from "../src/logs.ts";

Deno.test("normalizeLogLevel canonicalizes aliases", () => {
  assertEquals(normalizeLogLevel("WARNING"), "warn");
  assertEquals(normalizeLogLevel("critical"), "error");
  assertEquals(normalizeLogLevel("notice"), "info");
  assertEquals(normalizeLogLevel("finest"), "debug");
  assertEquals(normalizeLogLevel("fatal"), "fatal");
  assertEquals(normalizeLogLevel("nonsense"), "info");
});

Deno.test("logLevelRank orders severities", () => {
  assert(logLevelRank("trace") < logLevelRank("debug"));
  assert(logLevelRank("info") < logLevelRank("warn"));
  assert(logLevelRank("warn") < logLevelRank("error"));
  assert(logLevelRank("error") < logLevelRank("fatal"));
});
