import { db, usersTable } from "@workspace/db";
import { createHash } from "crypto";

function hashPassword(password: string): string {
  return createHash("sha256").update(password + "ea_cloud_salt_2024").digest("hex");
}

async function seed() {
  console.log("Seeding database...");

  await db.insert(usersTable).values({
    email: "eacloudhoster@gmail.com",
    password: hashPassword("Tapiwanashe@13"),
    firstName: "Super",
    lastName: "Admin",
    role: "superadmin",
    status: "approved",
    mentorName: "EA Cloud Owner",
    robotName: "EA Cloud",
    robotTagline: "Black by Code. Red by Choice.",
    licenseLimit: 1000,
    strikes: 0,
  }).onConflictDoUpdate({
    target: usersTable.email,
    set: {
      password: hashPassword("admin123"),
      role: "superadmin",
      status: "approved",
    },
  });

  console.log("✓ Superadmin seeded: eacloudhoster@gmail.com / Tapiwanashe@13");

  await db.insert(usersTable).values({
    email: "mentor@eacloud.com",
    password: hashPassword("mentor123"),
    firstName: "Demo",
    lastName: "Mentor",
    role: "mentor",
    status: "approved",
    mentorName: "SMC Blueprint",
    robotName: "SMC Blueprint EA",
    robotTagline: "@smcblueprint",
    licenseLimit: 50,
    strikes: 0,
  }).onConflictDoUpdate({
    target: usersTable.email,
    set: {
      password: hashPassword("mentor123"),
      role: "mentor",
      status: "approved",
    },
  });

  console.log("✓ Demo mentor seeded: mentor@eacloud.com / mentor123");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
