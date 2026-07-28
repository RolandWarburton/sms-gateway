export interface Config {
  signingKey: string;
  port: number;
  dbPath: string;
  // Max allowed clock skew for X-Timestamp (replay guard)
  // 0 disables.
  maxSkewSeconds: number;
  // OIDC (Dex) settings for the read API / frontend.
  // If oidcIssuer is empty, the /api routes are served WITHOUT auth (dev only).
  oidcIssuer: string;
  oidcClientId: string;
  allowedEmail: string;
  // Directory of built frontend assets to serve at `/`. Empty disables serving.
  frontendDir: string;
}

export function loadConfig(): Config {
  const signingKey = Deno.env.get("SIGNING_KEY");
  if (!signingKey) {
    console.error("FATAL: SIGNING_KEY environment variable is required");
    Deno.exit(1);
  }

  return {
    signingKey,
    port: Number(Deno.env.get("PORT") ?? "8080"),
    dbPath: Deno.env.get("DB_PATH") ?? "/data/sms.db",
    maxSkewSeconds: Number(Deno.env.get("MAX_SKEW_SECONDS") ?? "300"),
    oidcIssuer: (Deno.env.get("OIDC_ISSUER") ?? "").replace(/\/$/, ""),
    oidcClientId: Deno.env.get("OIDC_CLIENT_ID") ?? "sms-gateway",
    allowedEmail: Deno.env.get("ALLOWED_EMAIL") ?? "",
    frontendDir: Deno.env.get("FRONTEND_DIR") ?? "",
  };
}
