import { assert, assertEquals, assertFalse } from "@std/assert";
import { MessageStore, type WebhookBody } from "./db.ts";

function sample(messageId: string): WebhookBody {
  return {
    id: "evt_1",
    deviceId: "device_1",
    event: "sms:received",
    payload: {
      messageId,
      message: "hello",
      sender: "+15551234567",
      recipient: "+15557654321",
      simNumber: 1,
      receivedAt: "2024-06-22T15:46:11.000+07:00",
    },
  };
}

Deno.test("store() inserts a new message and returns true", () => {
  const store = new MessageStore(":memory:");
  assert(store.store(sample("m1"), "{}"));
});

Deno.test("store() ignores a duplicate messageId and returns false", () => {
  const store = new MessageStore(":memory:");
  assert(store.store(sample("dup"), "{}"));
  assertFalse(store.store(sample("dup"), "{}"));
  assertEquals(store.recent().length, 1);
});

Deno.test("store() persists all payload fields", () => {
  const store = new MessageStore(":memory:");
  store.store(sample("m2"), '{"raw":true}');

  const row = store.get("m2");
  assert(row);
  assertEquals(row.event, "sms:received");
  assertEquals(row.event_id, "evt_1");
  assertEquals(row.device_id, "device_1");
  assertEquals(row.sender, "+15551234567");
  assertEquals(row.recipient, "+15557654321");
  assertEquals(row.message, "hello");
  assertEquals(row.sim_number, 1);
  assertEquals(row.received_at, "2024-06-22T15:46:11.000+07:00");
  assertEquals(row.raw_json, '{"raw":true}');
});

Deno.test("get() returns undefined for an unknown messageId", () => {
  const store = new MessageStore(":memory:");
  assertEquals(store.get("nope"), undefined);
});

// Three messages with distinct senders, recipients, bodies and timestamps.
function seeded(): MessageStore {
  const store = new MessageStore(":memory:");
  const rows: [string, string, string, string, string][] = [
    [
      "a",
      "+15550001",
      "+15559999",
      "your code is 50% off",
      "2024-01-01T00:00:00Z",
    ],
    ["b", "+15550002", "+15558888", "hello world", "2024-03-01T00:00:00Z"],
    ["c", "+15550003", "+15557777", "code 1234", "2024-02-01T00:00:00Z"],
  ];
  for (const [id, sender, recipient, message, receivedAt] of rows) {
    store.store({
      event: "sms:received",
      payload: { messageId: id, sender, recipient, message, receivedAt },
    }, "{}");
  }
  return store;
}

const ids = (store: MessageStore, opts = {}) =>
  store.query(opts).rows.map((r) => r.message_id);

Deno.test("query() defaults to newest first", () => {
  assertEquals(ids(seeded()), ["b", "c", "a"]);
});

Deno.test("query() sorts by each whitelisted column in both directions", () => {
  const store = seeded();
  assertEquals(ids(store, { sort: "sender", dir: "asc" }), ["a", "b", "c"]);
  assertEquals(ids(store, { sort: "sender", dir: "desc" }), ["c", "b", "a"]);
  assertEquals(ids(store, { sort: "received_at", dir: "asc" }), [
    "a",
    "c",
    "b",
  ]);
});

Deno.test("query() searches sender, recipient and message", () => {
  const store = seeded();
  assertEquals(ids(store, { q: "0002" }), ["b"]); // sender
  assertEquals(ids(store, { q: "7777" }), ["c"]); // recipient
  assertEquals(ids(store, { q: "code" }), ["c", "a"]); // message, newest first
});

Deno.test("query() treats LIKE wildcards in the search term literally", () => {
  const store = seeded();
  // Only "your code is 50% off" contains a literal %; a naive LIKE would
  // return every row here.
  assertEquals(ids(store, { q: "50%" }), ["a"]);
  assertEquals(store.query({ q: "%" }).total, 1);
  assertEquals(store.query({ q: "_" }).total, 0);
});

Deno.test("query() paginates and reports the unpaginated total", () => {
  const store = seeded();
  assertEquals(ids(store, { limit: 2, offset: 0 }), ["b", "c"]);
  assertEquals(ids(store, { limit: 2, offset: 2 }), ["a"]);
  assertEquals(store.query({ limit: 2 }).total, 3);
  assertEquals(store.query({ q: "code", limit: 1 }).total, 2);
});

Deno.test("recent() returns messages newest first", () => {
  const store = new MessageStore(":memory:");
  const older = sample("older");
  older.payload!.receivedAt = "2024-01-01T00:00:00.000+00:00";
  const newer = sample("newer");
  newer.payload!.receivedAt = "2024-12-31T23:59:59.000+00:00";

  store.store(older, "{}");
  store.store(newer, "{}");

  const rows = store.recent();
  assertEquals(rows.map((r) => r.message_id), ["newer", "older"]);
});
