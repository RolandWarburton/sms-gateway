// SMS Gateway Receiver — entrypoint.
//
// Receives webhooks from the "SMS Gateway for Android" app (docs.sms-gate.app),
// verifies the HMAC-SHA256 signature, and stores incoming SMS in SQLite.
//
// It also serves the message browser, but only as bytes: the JSON read API
// (`/api/*`) and the pre-built Preact bundle in `frontendDir`. Nothing here
// renders HTML — the table is assembled in the browser by `web/main.tsx`.

import { loadConfig } from "./config.ts";
import { MessageStore } from "./db.ts";
import { Verifier } from "./signature.ts";
import { createAuthenticator } from "./auth.ts";
import { createRequestHandler } from "./handlers.ts";

const config = loadConfig();
const store = new MessageStore(config.dbPath);
const verifier = await Verifier.create(
  config.signingKey,
  config.maxSkewSeconds,
);
const auth = createAuthenticator(
  config.oidcIssuer,
  config.oidcClientId,
  config.allowedEmail,
);
const handler = createRequestHandler({
  verifier,
  store,
  auth,
  frontendDir: config.frontendDir,
  oidcIssuer: config.oidcIssuer,
  oidcClientId: config.oidcClientId,
});

Deno.serve({ port: config.port }, handler);
console.log(
  `sms-gateway-receiver listening on :${config.port}, db=${config.dbPath}` +
    (config.frontendDir ? `, frontend=${config.frontendDir}` : "") +
    (auth.enabled ? ", api-auth=on" : ", api-auth=OFF"),
);
