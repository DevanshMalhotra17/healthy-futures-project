import fs from "fs";
import path from "path";
import "dotenv/config";
import { pool } from "./pool";

async function migrate() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf-8");

  console.log("Applying schema to:", maskConnectionString(process.env.DATABASE_URL || ""));
  await pool.query(schemaSql);
  console.log("Migration complete.");
  await pool.end();
}

function maskConnectionString(url: string): string {
  return url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
