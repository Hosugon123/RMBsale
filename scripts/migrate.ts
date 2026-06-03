import { migrate } from "drizzle-orm/neon-http/migrator";
import { getDb } from "../api/_lib/db";

await migrate(getDb(), { migrationsFolder: "drizzle" });
console.log("Database migrations applied.");
