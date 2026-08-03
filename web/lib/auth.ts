// Authorization Code + PKCE against Dex, hand-rolled on Web Crypto.
//
// The resulting ID token is sent to /api/* as `Authorization: Bearer <jwt>`,
// where src/auth.ts verifies it against Dex's JWKS. Nothing here is trusted by
// the server, so the only job of this module is to obtain a token and hand it
// over. The token lives in sessionStorage: it dies with the tab, and Dex issues
// 7d tokens (expiry.idTokens in dex/config.yaml), so there is no refresh/
// silent-renew machinery.

import type { AppConfig } from "./types.ts";

const TOKEN_KEY = "sms.id_token";
const VERIFIER_KEY = "sms.pkce_verifier";
const STATE_KEY = "sms.pkce_state";

export const REDIRECT_PATH = "/callback";

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomString(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}

// Reads `exp` without verifying the signature — purely to avoid sending a token
// we already know is stale. The server does the real verification.
function isExpired(jwt: string): boolean {
  const part = jwt.split(".")[1];
  if (!part) return true;
  try {
    const payload = JSON.parse(
      atob(part.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: number };
    if (typeof payload.exp !== "number") return false;
    // 30s of slack so a token about to expire isn't used for a request in flight.
    return payload.exp * 1000 <= Date.now() + 30_000;
  } catch {
    return true;
  }
}

export function getToken(): string | null {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  if (isExpired(token)) {
    sessionStorage.removeItem(TOKEN_KEY);
    return null;
  }
  return token;
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error(`config request failed: ${res.status}`);
  return await res.json() as AppConfig;
}

// Sends the browser to Dex. Never returns.
export async function beginLogin(config: AppConfig): Promise<void> {
  const verifier = randomString();
  const state = randomString();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: location.origin + REDIRECT_PATH,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: "S256",
  });
  location.assign(`${config.issuer}/auth?${params}`);
}

// True when the current URL is the OAuth redirect landing.
export function isCallback(): boolean {
  return location.pathname === REDIRECT_PATH;
}

// Exchanges ?code for an ID token. Returns null on success (token stored), or
// an error message to display.
export async function completeLogin(config: AppConfig): Promise<string | null> {
  const params = new URLSearchParams(location.search);

  const oauthError = params.get("error");
  if (oauthError) {
    return params.get("error_description") ?? oauthError;
  }

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);

  if (!code) return "No authorization code in the callback URL.";
  // Guards against a forged callback: the state must match the one we generated.
  if (!state || !expectedState || state !== expectedState) {
    return "Login state mismatch — please try again.";
  }
  if (!verifier) return "Missing PKCE verifier — please try again.";

  const res = await fetch(`${config.issuer}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: location.origin + REDIRECT_PATH,
      client_id: config.clientId,
      code_verifier: verifier,
    }),
  });

  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return `Token exchange failed (${res.status}). ${detail}`.trim();
  }

  const body = await res.json() as { id_token?: string };
  if (!body.id_token) return "Dex returned no id_token.";

  sessionStorage.setItem(TOKEN_KEY, body.id_token);
  // Drop ?code= from the address bar so a reload doesn't retry a spent code.
  history.replaceState(null, "", "/");
  return null;
}
