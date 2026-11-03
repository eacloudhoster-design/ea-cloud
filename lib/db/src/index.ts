import { drizzle } from "drizzle-orm/node-postgres";
import { createDatabasePool, withPoolClient } from "./pool";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = createDatabasePool(process.env.DATABASE_URL);
export const db = drizzle(pool, { schema });
// Use the single-client adapter inside an outer release guarantee. Its nested
// transactions still use Drizzle savepoints, with exactly one pool checkout.
db.transaction = (transaction, config) =>
  withPoolClient(pool, (client) =>
    drizzle(client, { schema }).transaction(transaction, config),
  );

export * from "./schema";
