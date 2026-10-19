import { createHash } from "node:crypto";
import {
  bootstrapConfiguration,
  bootstrapFailure,
} from "./lib/bootstrap-diagnostics";

async function main() {
  let phase = "configuration validation";
  let closePool: (() => Promise<void>) | undefined;
  try {
    const { email, password } = bootstrapConfiguration(process.env);
    phase = "database module initialization";
    // Validate first, and catch initialization errors without dumping secrets.
    const { db, pool, usersTable } = await import("@workspace/db");
    closePool = () => pool.end();
    phase = "administrator insert";
    const inserted = await db
      .insert(usersTable)
      .values({
        email,
        password: createHash("sha256")
          .update(password + "ea_cloud_salt_2024")
          .digest("hex"),
        firstName: "Admin",
        lastName: "",
        role: "superadmin",
        status: "approved",
      })
      .onConflictDoNothing({ target: usersTable.email })
      .returning({ id: usersTable.id });
    console.log(
      inserted.length
        ? "Superadmin created."
        : "Account already exists; no credentials or permissions changed.",
    );
  } catch (error) {
    console.error(bootstrapFailure(error, phase));
    process.exitCode = 1;
  } finally {
    try {
      await closePool?.();
    } catch (error) {
      console.error(bootstrapFailure(error, "database connection cleanup"));
      process.exitCode = 1;
    }
  }
}

void main();
