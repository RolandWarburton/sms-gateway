import { assertEquals } from "@std/assert";
import { MessageStore } from "./db.ts";
import { Verifier } from "./signature.ts";
import { createRequestHandler } from "./handlers.ts";
import type { Authenticator } from "./auth.ts";
import { sign } from "./test_util.ts";

const KEY = "test-signing-key";

// Stub authenticator: authorizes iff the Authorization header equals "Bearer ok".
const stubAuth: Authenticator = {
  enabled: true,
  authenticate(req: Request): Promise<string | null> {
    return Promise.resolve(
      req.headers.get("Authorization") === "Bearer ok" ? "user@test" : null,
    );
  },
};

async function makeHandler(
  store = new MessageStore(":memory:"),
): Promise<(req: Request) => Promise<Response>> {
  const verifier = await Verifier.create(KEY, 0);
  return createRequestHandler({
    verifier,
    store,
    auth: stubAuth,
    frontendDir: "",
    oidcIssuer: "https://dex.test",
    oidcClientId: "sms-gateway",
  });
}

// Builds a correctly-signed POST /webhook request for the given body object.
async function signedPost(body: unknown): Promise<Request> {
  const raw = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000).toString();
  return new Request("http://localhost/webhook", {
    method: "POST",
    body: raw,
    headers: { "X-Timestamp": ts, "X-Signature": await sign(raw, ts, KEY) },
  });
}

Deno.test("GET /health returns ok", async () => {
  const handler = await makeHandler();
  const res = await handler(new Request("http://localhost/health"));
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "ok");
});

Deno.test("valid sms:received is stored", async () => {
  const handler = await makeHandler();
  const res = await handler(
    await signedPost({
      event: "sms:received",
      payload: { messageId: "m1", sender: "+1", message: "hi" },
    }),
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, stored: true });
});

Deno.test("duplicate messageId reports stored:false", async () => {
  const handler = await makeHandler();
  const msg = {
    event: "sms:received",
    payload: { messageId: "dup", message: "x" },
  };
  const first = await handler(await signedPost(msg));
  assertEquals(await first.json(), { ok: true, stored: true });
  const second = await handler(await signedPost(msg));
  assertEquals(await second.json(), { ok: true, stored: false });
});

Deno.test("bad signature is rejected with 401", async () => {
  const handler = await makeHandler();
  const res = await handler(
    new Request("http://localhost/webhook", {
      method: "POST",
      body: '{"event":"sms:received","payload":{"messageId":"m"}}',
      headers: { "X-Timestamp": "1700000000", "X-Signature": "deadbeef" },
    }),
  );
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test("non-message event is acked but not stored", async () => {
  const handler = await makeHandler();
  const res = await handler(
    await signedPost({ event: "system:ping", payload: {} }),
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, stored: false });
});

Deno.test("missing payload.messageId returns 400", async () => {
  const handler = await makeHandler();
  const res = await handler(
    await signedPost({ event: "sms:received", payload: { message: "no id" } }),
  );
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test("invalid JSON with valid signature returns 400", async () => {
  const handler = await makeHandler();
  const raw = "not json";
  const ts = Math.floor(Date.now() / 1000).toString();
  const res = await handler(
    new Request("http://localhost/webhook", {
      method: "POST",
      body: raw,
      headers: { "X-Timestamp": ts, "X-Signature": await sign(raw, ts, KEY) },
    }),
  );
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test("unknown path returns 404", async () => {
  const handler = await makeHandler();
  const res = await handler(new Request("http://localhost/nope"));
  assertEquals(res.status, 404);
  await res.body?.cancel();
});

Deno.test("GET /api/messages without token returns 401", async () => {
  const handler = await makeHandler();
  const res = await handler(new Request("http://localhost/api/messages"));
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test("GET /api/messages with token lists stored messages", async () => {
  const store = new MessageStore(":memory:");
  const handler = await makeHandler(store);
  await handler(
    await signedPost({
      event: "sms:received",
      payload: { messageId: "a1", sender: "+1", message: "hello" },
    }),
  );
  const res = await handler(
    new Request("http://localhost/api/messages", {
      headers: { Authorization: "Bearer ok" },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json() as { messages: { message_id: string }[] };
  assertEquals(body.messages.length, 1);
  assertEquals(body.messages[0]?.message_id, "a1");
});

Deno.test("GET /api/messages clamps limit and defaults to 100", async () => {
  const handler = await makeHandler();
  const listed = async (query: string) => {
    const res = await handler(
      new Request(`http://localhost/api/messages${query}`, {
        headers: { Authorization: "Bearer ok" },
      }),
    );
    return await res.json() as { limit: number; offset: number };
  };

  assertEquals((await listed("")).limit, 100);
  assertEquals((await listed("?limit=9999")).limit, 500);
  assertEquals((await listed("?limit=0")).limit, 1);
  assertEquals((await listed("?limit=abc")).limit, 100);
  assertEquals((await listed("?offset=-5")).offset, 0);
});

Deno.test("GET /api/messages falls back on an unknown sort column", async () => {
  const store = new MessageStore(":memory:");
  const handler = await makeHandler(store);
  for (const id of ["x1", "x2"]) {
    await handler(
      await signedPost({
        event: "sms:received",
        payload: {
          messageId: id,
          message: id,
          receivedAt: `2024-0${id === "x1" ? 1 : 2}-01T00:00:00Z`,
        },
      }),
    );
  }

  // An injection attempt in `sort` must be ignored, not interpolated.
  const res = await handler(
    new Request(
      "http://localhost/api/messages?sort=message;DROP+TABLE+messages&dir=sideways",
      { headers: { Authorization: "Bearer ok" } },
    ),
  );
  assertEquals(res.status, 200);
  const body = await res.json() as {
    messages: { message_id: string }[];
    total: number;
  };
  // Default ordering: received_at descending.
  assertEquals(body.messages.map((m) => m.message_id), ["x2", "x1"]);
  assertEquals(body.total, 2);
});

Deno.test("GET /api/messages searches and reports a total", async () => {
  const store = new MessageStore(":memory:");
  const handler = await makeHandler(store);
  for (const [id, msg] of [["s1", "your code is 123"], ["s2", "hello"]]) {
    await handler(
      await signedPost({
        event: "sms:received",
        payload: { messageId: id, message: msg },
      }),
    );
  }

  const res = await handler(
    new Request("http://localhost/api/messages?q=code", {
      headers: { Authorization: "Bearer ok" },
    }),
  );
  const body = await res.json() as {
    messages: { message_id: string }[];
    total: number;
  };
  assertEquals(body.total, 1);
  assertEquals(body.messages[0]?.message_id, "s1");
});

Deno.test("GET /api/config is served without a token", async () => {
  const handler = await makeHandler();
  const res = await handler(new Request("http://localhost/api/config"));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), {
    issuer: "https://dex.test",
    clientId: "sms-gateway",
    authDisabled: false,
  });

  // ...while the message routes stay guarded.
  const guarded = await handler(new Request("http://localhost/api/messages"));
  assertEquals(guarded.status, 401);
  await guarded.body?.cancel();
});

Deno.test("GET /api/messages/:id returns one message or 404", async () => {
  const store = new MessageStore(":memory:");
  const handler = await makeHandler(store);
  await handler(
    await signedPost({
      event: "sms:received",
      payload: { messageId: "b2", message: "detail" },
    }),
  );
  const hit = await handler(
    new Request("http://localhost/api/messages/b2", {
      headers: { Authorization: "Bearer ok" },
    }),
  );
  assertEquals(hit.status, 200);
  const body = await hit.json() as { message: { message: string } };
  assertEquals(body.message.message, "detail");

  const miss = await handler(
    new Request("http://localhost/api/messages/nope", {
      headers: { Authorization: "Bearer ok" },
    }),
  );
  assertEquals(miss.status, 404);
  await miss.body?.cancel();
});
