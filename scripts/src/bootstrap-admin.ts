import { createHash } from "node:crypto";
import { db, pool, usersTable } from "@workspace/db";

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password || password.length < 16) {
    throw new Error("Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (at least 16 characters) securely on the backend host.");
  }
  const inserted = await db.insert(usersTable).values({
    email,
    password: createHash("sha256").update(password + "ea_cloud_salt_2024").digest("hex"),
    firstName: "Admin",
    lastName: "",
    role: "superadmin",
    status: "approved",
  }).onConflictDoNothing({ target: usersTable.email }).returning({ id: usersTable.id });
  console.log(inserted.length ? "Superadmin created." : "Account already exists; no credentials or permissions changed.");
}

main().catch(() => {
  console.error("Admin bootstrap failed. Verify the bootstrap variables, database connection and schema on the backend host.");
  process.exitCode = 1;
}).finally(() => pool.end());
