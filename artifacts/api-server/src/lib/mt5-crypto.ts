import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";

// ─── MT5 password encryption ──────────────────────────────────────────────────
// Client MT5 passwords are required for copy-trade execution against the MT5 VPS,
// so they must be stored — but NEVER in plain text. We encrypt with AES-256-GCM
// using a server-side key derived from SESSION_SECRET (same approach as the API
// key store in api-key.ts). The encrypted value is stored in
// client_settings.encrypted_mt5_password and only decrypted at the moment a
// trade execution request is sent to the MT5 VPS.
//
// Stored format: "<ivHex>:<authTagHex>:<cipherHex>"

// Derived lazily so importing this module never crashes, but any attempt to
// encrypt/decrypt without a configured server secret fails loudly instead of
// silently falling back to a known constant key.
let cachedKey: Buffer | null = null;
function getEncKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too weak — refusing to encrypt MT5 passwords with an insecure key",
    );
  }
  cachedKey = scryptSync(secret, "ea-cloud-mt5pass-salt-v1", 32);
  return cachedKey;
}

export function encryptMT5Password(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptMT5Password(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted MT5 password format");
  const [ivHex, tagHex, encHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", getEncKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
