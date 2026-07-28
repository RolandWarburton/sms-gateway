// HTTP routing and request handling.

import { serveDir } from "@std/http/file-server";
import {
  type MessageStore,
  SORT_COLUMNS,
  type SortColumn,
  type SortDirection,
  type WebhookBody,
} from "./db.ts";
import type { Verifier } from "./signature.ts";
import type { Authenticator } from "./auth.ts";

// Event types whose payloads we persist as messages. Everything else is acked
// with 200 but not stored.
const STORED_EVENTS = new Set([
  "sms:received",
  "sms:data-received",
  "mms:received",
]);

// Page size bounds for /api/messages. The frontend's selector offers up to
// MAX_LIMIT; anything outside the range is clamped rather than rejected.
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function handleWebhook(
  req: Request,
  verifier: Verifier,
  store: MessageStore,
): Promise<Response> {
  const rawBody = await req.text();

  const ok = await verifier.verify(
    rawBody,
    req.headers.get("X-Timestamp"),
    req.headers.get("X-Signature"),
  );
  if (!ok) {
    console.warn("Rejected webhook: invalid signature");
    return json(401, { error: "invalid signature" });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "invalid JSON" });
  }

  const event = body.event ?? "";

  if (!STORED_EVENTS.has(event)) {
    // Acknowledge non-message events (sms:sent, system:ping, etc.) without storing.
    console.log(`Acked non-stored event: ${event}`);
    return json(200, { ok: true, stored: false });
  }

  const messageId = body.payload?.messageId as string | undefined;
  if (!messageId) {
    return json(400, { error: "missing payload.messageId" });
  }

  const stored = store.store(body, rawBody);
  console.log(
    `${stored ? "Stored" : "Duplicate"} ${event} messageId=${messageId} from=${
      body.payload?.sender ?? "?"
    }`,
  );
  return json(200, { ok: true, stored });
}

// Reads a bounded integer query param, falling back to `fallback` when absent
// or unparseable.
function intParam(
  url: URL,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

// GET /api/messages and GET /api/messages/:id — auth-guarded read API for the
// frontend. Returns 401 unless the request carries a valid Dex token.
async function handleApi(
  req: Request,
  url: URL,
  auth: Authenticator,
  store: MessageStore,
): Promise<Response> {
  const email = await auth.authenticate(req);
  if (!email) {
    return json(401, { error: "unauthorized" });
  }

  if (url.pathname === "/api/messages") {
    const limit = intParam(url, "limit", DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = intParam(url, "offset", 0, 0, Number.MAX_SAFE_INTEGER);
    const sortParam = url.searchParams.get("sort") ?? "";
    const sort: SortColumn = (SORT_COLUMNS as readonly string[]).includes(
        sortParam,
      )
      ? sortParam as SortColumn
      : "received_at";
    const dir: SortDirection = url.searchParams.get("dir") === "asc"
      ? "asc"
      : "desc";

    const { rows, total } = store.query({
      q: url.searchParams.get("q") ?? "",
      sort,
      dir,
      limit,
      offset,
    });
    return json(200, { messages: rows, total, limit, offset });
  }

  const idMatch = url.pathname.match(/^\/api\/messages\/(.+)$/);
  if (idMatch?.[1]) {
    const messageId = decodeURIComponent(idMatch[1]);
    const message = store.get(messageId);
    if (!message) return json(404, { error: "not found" });
    return json(200, { message });
  }

  return json(404, { error: "not found" });
}

interface Deps {
  verifier: Verifier;
  store: MessageStore;
  auth: Authenticator;
  // Directory of built frontend assets; empty disables static serving.
  frontendDir: string;
  // Advertised to the frontend via /api/config so the SPA can start the PKCE
  // flow without being rebuilt per environment. Neither value is secret.
  oidcIssuer: string;
  oidcClientId: string;
}

// Builds the top-level request handler wired to its dependencies.
export function createRequestHandler(
  deps: Deps,
): (req: Request) => Promise<Response> {
  const { verifier, store, auth, frontendDir, oidcIssuer, oidcClientId } = deps;

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { headers: { "content-type": "text/plain" } });
    }

    // Unauthenticated by design: the SPA has to read this before it can obtain
    // a token. Exposes only the public client id and the Dex issuer URL.
    if (req.method === "GET" && url.pathname === "/api/config") {
      return json(200, {
        issuer: oidcIssuer,
        clientId: oidcClientId,
        authDisabled: !auth.enabled,
      });
    }

    if (req.method === "POST" && url.pathname === "/webhook") {
      return await handleWebhook(req, verifier, store);
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/")) {
      return await handleApi(req, url, auth, store);
    }

    // Serve the built frontend for everything else (SPA), if configured.
    if (frontendDir && req.method === "GET") {
      const res = await serveDir(req, {
        fsRoot: frontendDir,
        quiet: true,
      });
      // SPA fallback: unknown non-asset paths return index.html so client-side
      // routing (and the OIDC callback) works on reload.
      if (res.status === 404 && !url.pathname.includes(".")) {
        return await serveDir(new Request(new URL("/", url), req), {
          fsRoot: frontendDir,
          quiet: true,
        });
      }
      return res;
    }

    return json(404, { error: "not found" });
  };
}
