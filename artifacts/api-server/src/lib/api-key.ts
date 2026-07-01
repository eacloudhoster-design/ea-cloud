import { randomBytes, createHash, createCipheriv, createDecipheriv, scryptSync } from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq, isNull, or } from "drizzle-orm";
import type { Logger } from "pino";

// ─── Key format ───────────────────────────────────────────────────────────────
// Raw key      : "eac_" + 48 random hex chars  (52 chars, 192-bit entropy)
// Stored hash  : SHA-256(rawKey) as hex — DB column `api_key`, never stored plain
// Stored enc   : AES-256-GCM(rawKey) — DB column `api_key_encrypted`, for MQ5 embedding
// Prefix       : first 8 chars of raw key — shown in UI for identification

// ─── Encryption key derived from session secret ───────────────────────────────
const ENC_KEY = scryptSync(
  process.env.SESSION_SECRET ?? "ea-cloud-dev-secret",
  "ea-cloud-apikey-salt-v1",
  32,
);

export function encryptApiKey(rawKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(rawKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptApiKey(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted key format");
  const [ivHex, tagHex, encHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// ─── Core helpers ─────────────────────────────────────────────────────────────
export function generateApiKey(): string {
  return "eac_" + randomBytes(24).toString("hex");
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function prefixFromKey(rawKey: string): string {
  return rawKey.substring(0, 8);
}

// ─── Lookup by raw key (hashes before querying) ───────────────────────────────
export async function getMentorByApiKey(
  rawKey: string,
): Promise<{ id: number; status: string } | null> {
  const hash = hashApiKey(rawKey);
  const [mentor] = await db
    .select({ id: usersTable.id, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.apiKey, hash))
    .limit(1);
  return mentor ?? null;
}

// ─── Issue a new key — stores hash + encrypted copy; returns raw key once ─────
export async function issueApiKey(
  mentorId: number,
): Promise<{ rawKey: string; hash: string; prefix: string }> {
  const rawKey = generateApiKey();
  const hash = hashApiKey(rawKey);
  const prefix = prefixFromKey(rawKey);
  const encrypted = encryptApiKey(rawKey);
  await db
    .update(usersTable)
    .set({ apiKey: hash, apiKeyPrefix: prefix, apiKeyEncrypted: encrypted })
    .where(eq(usersTable.id, mentorId));
  return { rawKey, hash, prefix };
}

// ─── Retrieve raw key from the encrypted store (for MQ5 embedding) ────────────
export async function getRawApiKeyForEmbed(mentorId: number): Promise<string | null> {
  const [row] = await db
    .select({ apiKeyEncrypted: usersTable.apiKeyEncrypted })
    .from(usersTable)
    .where(eq(usersTable.id, mentorId))
    .limit(1);
  if (!row?.apiKeyEncrypted) return null;
  try {
    return decryptApiKey(row.apiKeyEncrypted);
  } catch {
    return null;
  }
}

// ─── Ensure a mentor has a key (idempotent) ───────────────────────────────────
export async function ensureMentorHasApiKey(mentorId: number): Promise<void> {
  const [mentor] = await db
    .select({ apiKey: usersTable.apiKey })
    .from(usersTable)
    .where(eq(usersTable.id, mentorId))
    .limit(1);
  if (mentor?.apiKey) return;
  await issueApiKey(mentorId);
}

// ─── Startup backfill — any mentor without a key gets one ────────────────────
export async function backfillApiKeys(log: Logger): Promise<void> {
  try {
    const mentors = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(or(isNull(usersTable.apiKey), isNull(usersTable.apiKeyPrefix)));

    if (mentors.length === 0) return;

    await Promise.all(mentors.map((m) => issueApiKey(m.id)));
    log.info({ count: mentors.length }, "API keys backfilled for mentors");
  } catch (err) {
    log.warn({ err }, "API key backfill skipped");
  }
}

// ─── Backfill encrypted keys for existing mentors who have a hash but no enc ──
export async function backfillEncryptedKeys(log: Logger): Promise<void> {
  try {
    const mentors = await db
      .select({ id: usersTable.id, apiKey: usersTable.apiKey })
      .from(usersTable)
      .where(
        // has a hash but no encrypted copy
        // We can't recover the raw key from the hash, so we reissue a fresh key
        isNull(usersTable.apiKeyEncrypted),
      );

    if (mentors.length === 0) return;

    // Reissue keys so both hash + encrypted are consistent
    await Promise.all(
      mentors
        .filter((m) => m.apiKey !== null)
        .map((m) => issueApiKey(m.id)),
    );
    log.info(
      { count: mentors.length },
      "Encrypted API keys backfilled — mentors will need to re-download their MQ5 file",
    );
  } catch (err) {
    log.warn({ err }, "Encrypted key backfill skipped");
  }
}
