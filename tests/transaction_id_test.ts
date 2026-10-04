import { assertEquals, assertMatch } from "@std/assert";
import {
  currentTransactionId,
  Errorgap,
  runInTransaction,
  withErrorgap,
} from "../mod.ts";

// Errors reported during a transaction carry its id, so errorgap shows the
// error a request actually raised on its trace and links the two.

interface Captured {
  path: string;
  // deno-lint-ignore no-explicit-any
  body: Record<string, any>;
}

async function withIngestor(
  fn: (requests: Captured[]) => Promise<void>,
): Promise<void> {
  const requests: Captured[] = [];
  const ac = new AbortController();
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, signal: ac.signal, onListen: () => {} },
    async (req: Request): Promise<Response> => {
      requests.push({
        path: new URL(req.url).pathname,
        body: await req.json(),
      });
      return new Response("{}", { status: 201 });
    },
  );
  Errorgap.init({
    endpoint: `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}`,
    projectSlug: "demo",
    apiKey: "egp_test",
    async: false,
    captureGlobals: false,
    apmEnabled: true,
    apmSampleRate: 1,
  });
  try {
    await fn(requests);
  } finally {
    ac.abort();
    await server.finished.catch(() => {});
  }
}

Deno.test("an error inside a transaction carries its id", async () => {
  await withIngestor(async (requests) => {
    let seen: string | undefined;
    await Errorgap.trackTransaction(
      { method: "GET", path: "/orders/{id}" },
      async () => {
        await new Promise((r) => setTimeout(r, 1));
        seen = currentTransactionId();
        await Errorgap.notify(new Error("card declined"), { sync: true });
      },
    );
    await Errorgap.notify(new Error("after"), { sync: true });
    await Errorgap.flush();

    assertMatch(seen!, /^[0-9a-f-]{36}$/);
    const transaction = requests.find((r) => r.path.endsWith("/transactions"))!;
    assertEquals(transaction.body.id, seen);
    const inside = requests.find((r) =>
      r.body.errors?.[0]?.message === "card declined"
    )!;
    const after = requests.find((r) =>
      r.body.errors?.[0]?.message === "after"
    )!;
    assertEquals(inside.body.context.transaction_id, seen);
    assertEquals(after.body.context.transaction_id, undefined);
    assertEquals(currentTransactionId(), undefined);
  });
});

Deno.test("each job gets its own id and concurrent flows stay apart", async () => {
  await withIngestor(async (requests) => {
    let jobId: string | undefined;
    await Errorgap.trackJob("ReceiptJob", () => {
      jobId = currentTransactionId();
    });
    await Errorgap.flush();
    assertEquals(
      requests.find((r) => r.path.endsWith("/transactions"))!.body.id,
      jobId,
    );

    const results = await Promise.all(
      ["a", "b"].map((id) =>
        runInTransaction(id, async () => {
          await new Promise((r) => setTimeout(r, 5));
          return currentTransactionId();
        })
      ),
    );
    assertEquals(results, ["a", "b"]);
  });
});

Deno.test("withErrorgap records a Deno.serve request and links its errors", async () => {
  await withIngestor(async (requests) => {
    const ac = new AbortController();
    const app = Deno.serve(
      {
        hostname: "127.0.0.1",
        port: 0,
        signal: ac.signal,
        onListen: () => {},
        onError: () => new Response("oops", { status: 500 }),
      },
      withErrorgap(async (request: Request): Promise<Response> => {
        await new Promise((r) => setTimeout(r, 2));
        if (new URL(request.url).pathname === "/boom") {
          throw new Error("kaboom");
        }
        return new Response("ok", { status: 201 });
      }),
    );
    const port = (app.addr as Deno.NetAddr).port;
    const ok = await fetch(`http://127.0.0.1:${port}/orders/123?x=1`, {
      headers: { "x-errorgap-trace": "0192F3C4-7A1B-4C2D-9E3F-0123456789AB" },
    });
    await ok.body?.cancel();
    const boom = await fetch(`http://127.0.0.1:${port}/boom`);
    await boom.body?.cancel();
    assertEquals([ok.status, boom.status], [201, 500]);
    for (let i = 0; i < 100 && requests.length < 3; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    await Errorgap.flush();
    ac.abort();
    await app.finished.catch(() => {});

    const txns = requests.filter((r) => r.path.endsWith("/transactions")).map((
      r,
    ) => r.body);
    const okTxn = txns.find((t) => t.path_raw === "/orders/123")!;
    const boomTxn = txns.find((t) => t.path_raw === "/boom")!;
    assertEquals(okTxn.path, "/orders/:id");
    assertEquals(okTxn.trace_id, "0192f3c4-7a1b-4c2d-9e3f-0123456789ab");
    assertEquals(boomTxn.status_code, 500);
    const notice = requests.find((r) => r.path.endsWith("/notices"))!.body;
    assertEquals(notice.context.transaction_id, boomTxn.id);
  });
});
