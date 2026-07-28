// HMAC-SHA256 webhook signature verification.
//
// The app signs HMAC-SHA256(raw_body + timestamp, signing_key) and sends the hex
// digest in X-Signature with the timestamp (unix seconds) in X-Timestamp.

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time comparison over the two hex signatures.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export class Verifier {
  #key: CryptoKey;
  #maxSkewSeconds: number;

  private constructor(key: CryptoKey, maxSkewSeconds: number) {
    this.#key = key;
    this.#maxSkewSeconds = maxSkewSeconds;
  }

  static async create(
    signingKey: string,
    maxSkewSeconds: number,
  ): Promise<Verifier> {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(signingKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    return new Verifier(key, maxSkewSeconds);
  }

  async verify(
    rawBody: string,
    timestamp: string | null,
    signature: string | null,
  ): Promise<boolean> {
    if (!timestamp || !signature) return false;

    if (this.#maxSkewSeconds > 0) {
      const ts = Number(timestamp);
      if (!Number.isFinite(ts)) return false;
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - ts) > this.#maxSkewSeconds) return false;
    }

    const mac = await crypto.subtle.sign(
      "HMAC",
      this.#key,
      new TextEncoder().encode(rawBody + timestamp),
    );
    return timingSafeEqual(toHex(mac), signature.toLowerCase());
  }
}
