// OIDC (Dex) JWT verification for the read API.
//
// The frontend logs in against Dex via Authorization Code + PKCE and sends the
// resulting ID token as `Authorization: Bearer <jwt>`. We verify that token's
// signature against Dex's JWKS and check issuer, audience, expiry, and the
// signed-in email against the single allowed account.

import { createRemoteJWKSet, jwtVerify } from "jose";

export interface Authenticator {
  // Returns the verified email on success, or null if the request is not
  // authorized. `null` config (issuer unset) means auth is disabled and every
  // request is treated as the allowed user.
  authenticate(req: Request): Promise<string | null>;
  readonly enabled: boolean;
}

class OidcAuthenticator implements Authenticator {
  readonly enabled = true;
  #jwks: ReturnType<typeof createRemoteJWKSet>;
  #issuer: string;
  #clientId: string;
  #allowedEmail: string;

  constructor(issuer: string, clientId: string, allowedEmail: string) {
    this.#issuer = issuer;
    this.#clientId = clientId;
    this.#allowedEmail = allowedEmail;
    this.#jwks = createRemoteJWKSet(new URL(`${issuer}/keys`));
  }

  async authenticate(req: Request): Promise<string | null> {
    const header = req.headers.get("Authorization") ?? "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1];
    if (!token) return null;

    try {
      const { payload } = await jwtVerify(token, this.#jwks, {
        issuer: this.#issuer,
        audience: this.#clientId,
      });
      const email = typeof payload.email === "string" ? payload.email : null;
      if (!email) return null;
      if (this.#allowedEmail && email !== this.#allowedEmail) return null;
      return email;
    } catch {
      return null;
    }
  }
}

class DisabledAuthenticator implements Authenticator {
  readonly enabled = false;
  authenticate(_req: Request): Promise<string | null> {
    return Promise.resolve("auth-disabled");
  }
}

// Builds an authenticator from config. When issuer is empty, auth is disabled
// (dev only) and a warning is logged.
export function createAuthenticator(
  issuer: string,
  clientId: string,
  allowedEmail: string,
): Authenticator {
  if (!issuer) {
    console.warn(
      "WARNING: OIDC_ISSUER not set — /api routes are UNAUTHENTICATED (dev mode)",
    );
    return new DisabledAuthenticator();
  }
  return new OidcAuthenticator(issuer, clientId, allowedEmail);
}
