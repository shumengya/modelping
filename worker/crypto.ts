/** AES-GCM encrypt/decrypt for API keys at rest. */

function encEncoder(): TextEncoder {
  return new TextEncoder();
}

async function getCryptoKey(env: Env): Promise<CryptoKey> {
  const raw = await resolveRawKey(env);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function resolveRawKey(env: Env): Promise<ArrayBuffer> {
  if (env.ENCRYPTION_KEY?.trim()) {
    const s = env.ENCRYPTION_KEY.trim();
    try {
      const buf = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      if (buf.byteLength === 32) return buf.buffer;
    } catch {
      /* fall through */
    }
    const digest = await crypto.subtle.digest("SHA-256", encEncoder().encode(s));
    return digest;
  }
  const digest = await crypto.subtle.digest("SHA-256", encEncoder().encode(env.ADMIN_TOKEN));
  return digest;
}

export async function encryptSecret(plain: string, env: Env): Promise<{ ciphertext: ArrayBuffer; nonce: Uint8Array }> {
  const key = await getCryptoKey(env);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, encEncoder().encode(plain));
  return { ciphertext, nonce };
}

/** Normalize D1 BLOB columns: cloud/local may return ArrayBuffer, Uint8Array, or number[]. */
export function d1BlobToUint8Array(v: unknown): Uint8Array {
  if (v == null) throw new TypeError("blob is null or undefined");
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (Array.isArray(v)) return new Uint8Array(v as number[]);
  if (typeof v === "object" && "buffer" in v && (v as ArrayBufferView).buffer instanceof ArrayBuffer) {
    const t = v as ArrayBufferView;
    return new Uint8Array(t.buffer.slice(t.byteOffset, t.byteOffset + t.byteLength));
  }
  throw new TypeError("unsupported BLOB shape from D1");
}

export async function decryptSecret(ciphertext: unknown, nonce: unknown, env: Env): Promise<string> {
  const ct = d1BlobToUint8Array(ciphertext);
  const iv = d1BlobToUint8Array(nonce);
  const key = await getCryptoKey(env);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct);
  return new TextDecoder().decode(plain);
}

export function toB64(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s);
}

export function fromB64(s: string): ArrayBuffer {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}
