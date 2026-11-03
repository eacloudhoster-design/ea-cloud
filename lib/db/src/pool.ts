import pg from "pg";

// No credentials, SQL, driver messages or client objects may enter these records.
export function databaseErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" &&
    /^(?:[0-9A-Z]{5}|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE)$/.test(
      code,
    )
    ? code
    : "UNKNOWN";
}

export function poolSnapshot(pool: pg.Pool) {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

/** Own checkout through BEGIN, callback, COMMIT and ROLLBACK. In particular,
 * drizzle's pooled adapter starts BEGIN before its own release finally block.
 * A failed BEGIN must not strand a checked-out client. Never retry mutations.
 */
export async function withPoolClient<T>(
  pool: pg.Pool,
  run: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let failed = false;
  try {
    return await run(client);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    // Discard on failure, including failed rollback or uncertain COMMIT outcome.
    // pg accepts true to destroy, without passing potentially private errors.
    client.release(failed);
  }
}

export function createDatabasePool(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    // Bound queries even on broken sockets. Do not send new PostgreSQL startup
    // GUCs: DATABASE_URL may point to Neon's transaction pooler. A timeout never
    // triggers a mutation replay; failed transactions discard their connection.
    query_timeout: 65_000,
  });
  pool.on("error", (error) => {
    // pg-pool has already removed and closed the failed idle client. Do not
    // restart the process, end the healthy pool, replay SQL, or log err.client.
    console.error(
      JSON.stringify({
        event: "database_idle_connection_failed",
        code: databaseErrorCode(error),
        pool: poolSnapshot(pool),
      }),
    );
  });
  return pool;
}
