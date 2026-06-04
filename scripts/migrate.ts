import "./loadEnv.ts";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not configured.");
}

const sql = neon(url);

function splitStatements(content: string) {
  return content
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));
}

const folder = "drizzle";
const files = readdirSync(folder)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of files) {
  const content = readFileSync(join(folder, file), "utf8");
  for (const statement of splitStatements(content)) {
    await sql.query(`${statement};`);
  }
  console.log(`Applied ${file}`);
}

console.log("Database migrations applied.");
