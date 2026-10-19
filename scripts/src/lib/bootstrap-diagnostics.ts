const guidance: Record<string, string> = {
  BOOTSTRAP_ADMIN_EMAIL_MISSING:
    "Set BOOTSTRAP_ADMIN_EMAIL in the Render service environment before running bootstrap.",
  BOOTSTRAP_ADMIN_EMAIL_INVALID:
    "BOOTSTRAP_ADMIN_EMAIL must be a valid email address, without surrounding quotes.",
  BOOTSTRAP_ADMIN_PASSWORD_MISSING:
    "Set BOOTSTRAP_ADMIN_PASSWORD securely in the Render service environment before running bootstrap.",
  BOOTSTRAP_ADMIN_PASSWORD_SHORT:
    "BOOTSTRAP_ADMIN_PASSWORD must contain at least 16 characters. Its value has not been logged.",
  DATABASE_URL_MISSING:
    "Set DATABASE_URL on the same Render service that executes bootstrap.",
  DATABASE_URL_INVALID:
    "DATABASE_URL must be a PostgreSQL connection URI with a hostname and database name; copy the provider URI without surrounding quotes.",
  "28P01":
    "PostgreSQL rejected the database credentials. Check the database role and DATABASE_URL in Render; do not change the admin password to fix a database login error.",
  "28000":
    "PostgreSQL rejected database authorization. Check the connection role, provider access rules and TLS requirements.",
  "3D000":
    "The target database does not exist. Confirm bootstrap uses the same database as the successful schema command.",
  "3F000":
    "The target schema does not exist. Check the connection search_path and schema configuration.",
  "42P01":
    "A required table is missing in this connection's schema. Confirm bootstrap and schema push use the same DATABASE_URL and search_path.",
  "42703":
    "A required column is missing. Review the users schema against lib/db/src/schema/users.ts; do not reset or drop existing tables.",
  "42P10":
    "The users email conflict target lacks its expected unique constraint. Review the schema diff before applying a migration.",
  "42501":
    "The database role lacks a required table, sequence or schema permission. Review grants for the bootstrap role.",
  "25006":
    "The database connection is read-only. Use the authorized writable database role/endpoint for bootstrap.",
  "23502":
    "The database requires a value absent from the insert. Check for schema drift or extra NOT NULL columns in users.",
  "23505":
    "A different unique constraint rejected the insert. Review users constraints or sequence state without resetting accounts.",
  "23514":
    "A database check constraint rejected the insert. Review the users schema and allowed role/status values.",
  "53300":
    "The database connection limit was reached. Retry after checking connection usage.",
  "57P03":
    "The database is not accepting connections yet. Check provider status and retry when ready.",
  "08001":
    "A database connection could not be established. Check the provider endpoint and network access.",
  "08006":
    "The database connection failed. Check provider status and network access.",
  ECONNREFUSED:
    "The database endpoint refused the connection. Check DATABASE_URL and provider availability.",
  ENOTFOUND:
    "The database hostname could not be resolved. Check the provider hostname in DATABASE_URL.",
  EAI_AGAIN:
    "Database hostname resolution failed temporarily. Check networking and retry.",
  ETIMEDOUT:
    "The database connection timed out. Check network access and provider availability.",
  DEPTH_ZERO_SELF_SIGNED_CERT:
    "TLS certificate verification failed. Use the provider-supported certificate/trust configuration; do not disable verification.",
  SELF_SIGNED_CERT_IN_CHAIN:
    "TLS certificate verification failed. Check the provider-supported CA configuration; do not disable verification.",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE:
    "The database TLS certificate chain could not be verified. Check the trusted CA configuration.",
  CERT_HAS_EXPIRED:
    "The database TLS certificate has expired. Check the provider certificate and system clock.",
  ERR_TLS_CERT_ALTNAME_INVALID:
    "The database TLS certificate does not match the hostname. Check the provider URI.",
  ERR_MODULE_NOT_FOUND:
    "A runtime dependency is missing. Install from the repository root with pnpm install --frozen-lockfile --prod=false.",
  MODULE_NOT_FOUND:
    "A runtime dependency is missing. Install from the repository root with pnpm install --frozen-lockfile --prod=false.",
};

class ConfigurationError extends Error {
  readonly code: string;
  constructor(code: string) {
    super("Invalid bootstrap configuration");
    this.code = code;
  }
}

export function bootstrapConfiguration(env: NodeJS.ProcessEnv) {
  const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) throw new ConfigurationError("BOOTSTRAP_ADMIN_EMAIL_MISSING");
  if (!/^[^\s@"']+@[^\s@"']+\.[^\s@"']+$/.test(email)) {
    throw new ConfigurationError("BOOTSTRAP_ADMIN_EMAIL_INVALID");
  }
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!password)
    throw new ConfigurationError("BOOTSTRAP_ADMIN_PASSWORD_MISSING");
  if (password.length < 16)
    throw new ConfigurationError("BOOTSTRAP_ADMIN_PASSWORD_SHORT");
  if (!env.DATABASE_URL) throw new ConfigurationError("DATABASE_URL_MISSING");
  try {
    const url = new URL(env.DATABASE_URL);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2
    ) {
      throw new Error("Invalid database URI");
    }
  } catch {
    throw new ConfigurationError("DATABASE_URL_INVALID");
  }
  return { email, password };
}

export function bootstrapFailure(error: unknown, phase: string): string {
  // Drizzle wraps driver errors, and its message/query/params may contain hashes
  // or connection details. Log only codes with predetermined explanations.
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();
  while (queue.length && seen.size < 16) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object" || seen.has(candidate))
      continue;
    seen.add(candidate);
    const entry = candidate as {
      code?: unknown;
      cause?: unknown;
      errors?: unknown;
    };
    if (typeof entry.code === "string" && Object.hasOwn(guidance, entry.code)) {
      return `Admin bootstrap failed during ${phase} [${entry.code}]. ${guidance[entry.code]}`;
    }
    queue.push(entry.cause);
    if (Array.isArray(entry.errors)) queue.push(...entry.errors.slice(0, 16));
  }
  return `Admin bootstrap failed during ${phase} [UNCLASSIFIED]. No raw error, SQL, parameters or credentials were logged. Check provider logs and database/schema configuration privately.`;
}
