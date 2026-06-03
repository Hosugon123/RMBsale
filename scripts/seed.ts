import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "../api/_lib/db";
import { accounts, holders, users } from "../api/_lib/schema";

const db = getDb();

const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;

if (!username || !password) {
  throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD are required for seed.");
}

const [existing] = await db.select().from(users).where(eq(users.username, username));
if (!existing) {
  await db.insert(users).values({
    username,
    passwordHash: await bcrypt.hash(password, 12),
    role: "admin"
  });
}

let [holder] = await db.select().from(holders).where(eq(holders.name, "主要帳戶"));
if (!holder) {
  [holder] = await db.insert(holders).values({ name: "主要帳戶" }).returning();
}

const existingAccounts = await db.select().from(accounts).where(eq(accounts.holderId, holder.id));
if (existingAccounts.length === 0) {
  await db.insert(accounts).values([
    { holderId: holder.id, name: "台幣現金", currency: "TWD", balance: "0.00" },
    { holderId: holder.id, name: "人民幣庫存", currency: "RMB", balance: "0.00" }
  ]);
}

console.log("Seed completed.");
