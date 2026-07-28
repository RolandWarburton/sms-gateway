// Shared helpers for tests.

// Produces the hex HMAC-SHA256 the phone app sends in X-Signature:
// hex(HMAC-SHA256(body + timestamp, key)).
export async function sign(
  body: string,
  timestamp: string,
  key: string,
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(body + timestamp),
  );
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
