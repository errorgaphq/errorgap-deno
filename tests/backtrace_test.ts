import { assert, assertEquals } from "@std/assert";
import { parseBacktrace } from "../src/backtrace.ts";

Deno.test("parseBacktrace returns empty array when stack missing", () => {
  const err = new Error("x");
  err.stack = undefined as unknown as string;
  assertEquals(parseBacktrace(err), []);
});

Deno.test("parseBacktrace captures column and reads source from the real error site", () => {
  let err!: Error;
  function boom() {
    err = new Error("boom");
  }
  boom();

  const frames = parseBacktrace(err, Deno.cwd());
  const appFrame = frames.find(
    (f) => f.in_app && (f.file ?? "").includes("backtrace_test.ts"),
  );
  assert(appFrame !== undefined);
  assertEquals(typeof appFrame.line, "number");
  assertEquals(typeof appFrame.column, "number");
  assert(appFrame.source !== undefined);
  assert(appFrame.source.lines.some((l) => l.includes("new Error")));
});

Deno.test("parseBacktrace classifies deps and internal frames as not in_app", () => {
  const err = new Error("x");
  err.stack = [
    "Error: x",
    "    at handler (/app/src/app.ts:10:5)",
    "    at load (/app/node_modules/pg/lib/client.js:1:1)",
    "    at run (ext:core/01_core.js:1:1)",
  ].join("\n");
  const frames = parseBacktrace(err, "/app");
  assertEquals(frames[0].in_app, true);
  assertEquals(frames[1].in_app, false);
  assertEquals(frames[2].in_app, false);
  assertEquals(frames[0].file, "src/app.ts");
});

Deno.test("parseBacktrace classifies Deno npm cache and remote modules as vendor", () => {
  const err = new Error("x");
  err.stack = [
    "Error: x",
    "    at parse (file:///deno-dir/npm/registry.npmjs.org/zod/3.23.8/lib/index.mjs:692:22)",
    "    at fetch (https://deno.land/x/oak/mod.ts:5:9)",
    "    at handler (file:///app/src/app.ts:10:5)",
  ].join("\n");
  const frames = parseBacktrace(err, "/app");
  assertEquals(frames[0].in_app, false); // npm cache
  assertEquals(frames[1].in_app, false); // remote https module
  assertEquals(frames[2].in_app, true); // app source
});
