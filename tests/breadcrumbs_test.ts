import { assertEquals } from "@std/assert";
import { BreadcrumbBuffer } from "../src/breadcrumbs.ts";

Deno.test("BreadcrumbBuffer records message, category, and metadata", () => {
  const buffer = new BreadcrumbBuffer(10);
  buffer.add("handled request", {
    category: "http",
    metadata: { path: "/orders" },
  });
  const [crumb] = buffer.snapshot();
  assertEquals(crumb.message, "handled request");
  assertEquals(crumb.category, "http");
  assertEquals(crumb.metadata, { path: "/orders" });
  assertEquals(typeof crumb.timestamp, "string");
});

Deno.test("BreadcrumbBuffer drops the oldest beyond capacity", () => {
  const buffer = new BreadcrumbBuffer(3);
  for (let i = 0; i < 5; i++) buffer.add(`event ${i}`);
  assertEquals(buffer.snapshot().map((c) => c.message), [
    "event 2",
    "event 3",
    "event 4",
  ]);
});

Deno.test("BreadcrumbBuffer keeps nothing when capacity is zero", () => {
  const buffer = new BreadcrumbBuffer(0);
  buffer.add("ignored");
  assertEquals(buffer.snapshot(), []);
});

Deno.test("BreadcrumbBuffer clears recorded crumbs", () => {
  const buffer = new BreadcrumbBuffer(5);
  buffer.add("one");
  buffer.clear();
  assertEquals(buffer.snapshot(), []);
});
