#!/usr/bin/env -S deno run --allow-net --allow-env
// Send a correctly-signed sms:received webhook to a running receiver.
//
// Usage:
//   SIGNING_KEY=test ./scripts/test-webhook.ts [URL] [messageId]
//
// URL defaults to http://127.0.0.1:8080/webhook.
// Pass a fixed messageId to test idempotency (re-send the same id).

import { sign } from "../src/test_util.ts";

const url = Deno.args[0] ?? "http://127.0.0.1:8080/webhook";
const key = Deno.env.get("SIGNING_KEY") ?? "test";

const now = Math.floor(Date.now() / 1000);
const messageId = Deno.args[1] ?? `msg_${now}`;

const body = JSON.stringify({
  deviceId: "test-device-0001",
  event: "sms:received",
  id: `evt_${now}`,
  payload: {
    messageId,
    message: "Hello from test-webhook.ts",
    sender: "+15551234567",
    recipient: "+15557654321",
    simNumber: 1,
    receivedAt: new Date().toISOString(),
  },
  webhookId: "wh_test",
});

const timestamp = String(now);
const signature = await sign(body, timestamp, key);

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Timestamp": timestamp,
    "X-Signature": signature,
  },
  body,
});

console.log(res.status, await res.text());
