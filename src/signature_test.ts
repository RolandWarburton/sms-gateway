import { assert, assertFalse } from "@std/assert";
import { Verifier } from "./signature.ts";
import { sign } from "./test_util.ts";

const KEY = "test-signing-key";

Deno.test("accepts a valid signature", async () => {
  const v = await Verifier.create(KEY, 0);
  const body = '{"event":"sms:received"}';
  const ts = "1700000000";
  assert(await v.verify(body, ts, await sign(body, ts, KEY)));
});

Deno.test("rejects a tampered body", async () => {
  const v = await Verifier.create(KEY, 0);
  const ts = "1700000000";
  const sig = await sign('{"event":"sms:received"}', ts, KEY);
  assertFalse(await v.verify('{"event":"sms:sent"}', ts, sig));
});

Deno.test("rejects a signature made with the wrong key", async () => {
  const v = await Verifier.create(KEY, 0);
  const body = "payload";
  const ts = "1700000000";
  assertFalse(await v.verify(body, ts, await sign(body, ts, "other-key")));
});

Deno.test("rejects missing signature or timestamp", async () => {
  const v = await Verifier.create(KEY, 0);
  assertFalse(await v.verify("payload", "1700000000", null));
  assertFalse(await v.verify("payload", null, "abc123"));
});

Deno.test("accepts uppercase hex signature", async () => {
  const v = await Verifier.create(KEY, 0);
  const body = "payload";
  const ts = "1700000000";
  const sig = (await sign(body, ts, KEY)).toUpperCase();
  assert(await v.verify(body, ts, sig));
});

Deno.test("enforces the timestamp skew window", async () => {
  const v = await Verifier.create(KEY, 300);
  const now = Math.floor(Date.now() / 1000).toString();
  assert(await v.verify("payload", now, await sign("payload", now, KEY)));

  const stale = (Math.floor(Date.now() / 1000) - 1000).toString();
  assertFalse(
    await v.verify("payload", stale, await sign("payload", stale, KEY)),
  );
});

Deno.test("rejects a non-numeric timestamp when skew is enforced", async () => {
  const v = await Verifier.create(KEY, 300);
  const ts = "not-a-number";
  assertFalse(await v.verify("payload", ts, await sign("payload", ts, KEY)));
});
