import "./loadEnv.ts";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "../api/_lib/db";
import { accounts, channels, customers, holders, users } from "../api/_lib/schema";
import { ALL_PERMISSIONS, presetForRole, serializePermissions } from "../api/_lib/userPermissions";

const db = getDb();

const username = process.env.ADMIN_USERNAME ?? "ds001";
const password = process.env.ADMIN_PASSWORD ?? "1234";

const passwordHash = await bcrypt.hash(password, 12);
let [admin] = await db.select().from(users).where(eq(users.username, username));
if (!admin) {
  const [legacyAdmin] = await db.select().from(users).where(eq(users.username, "admin"));
  if (legacyAdmin) {
    [admin] = await db
      .update(users)
      .set({
        username,
        passwordHash,
        role: "admin",
        isActive: true,
        displayName: "系統管理員",
        permissionsJson: serializePermissions([...ALL_PERMISSIONS])
      })
      .where(eq(users.id, legacyAdmin.id))
      .returning();
    console.log(`已將舊帳號 admin 改為 ${username}`);
  } else {
    [admin] = await db
      .insert(users)
      .values({
        username,
        passwordHash,
        role: "admin",
        displayName: "系統管理員",
        permissionsJson: serializePermissions([...ALL_PERMISSIONS])
      })
      .returning();
  }
} else {
  await db
    .update(users)
    .set({
      passwordHash,
      isActive: true,
      displayName: admin.displayName ?? "系統管理員",
      permissionsJson: admin.permissionsJson ?? serializePermissions([...ALL_PERMISSIONS])
    })
    .where(eq(users.id, admin.id));
}

const operatorName = process.env.OPERATOR_USERNAME ?? "operator";
const operatorPassword = process.env.OPERATOR_PASSWORD ?? "operator123";
let [operator] = await db.select().from(users).where(eq(users.username, operatorName));
if (!operator) {
  const operatorPermissions = presetForRole("operator");
  [operator] = await db
    .insert(users)
    .values({
      username: operatorName,
      passwordHash: await bcrypt.hash(operatorPassword, 12),
      role: "operator",
      displayName: "操作員",
      permissionsJson: serializePermissions(operatorPermissions)
    })
    .returning();
}

const holderSeed = [
  { name: "小許" },
  { name: "團隊帳戶" }
];

for (const item of holderSeed) {
  const [existing] = await db.select().from(holders).where(eq(holders.name, item.name));
  if (!existing) await db.insert(holders).values(item);
}

const allHolders = await db.select().from(holders);
const holderByName = new Map(allHolders.map((h) => [h.name, h]));

const accountSeed = [
  { holder: "小許", name: "台幣現金", currency: "TWD" as const, balance: "120000.00" },
  { holder: "小許", name: "人民幣庫存", currency: "RMB" as const, balance: "38000.00" },
  { holder: "團隊帳戶", name: "台幣銀行", currency: "TWD" as const, balance: "260000.00" },
  { holder: "團隊帳戶", name: "支付寶 RMB", currency: "RMB" as const, balance: "58500.00" }
];

for (const item of accountSeed) {
  const holder = holderByName.get(item.holder);
  if (!holder) continue;
  const rows = await db.select().from(accounts).where(eq(accounts.holderId, holder.id));
  if (!rows.some((row) => row.name === item.name)) {
    await db.insert(accounts).values({
      holderId: holder.id,
      name: item.name,
      currency: item.currency,
      balance: item.balance
    });
  }
}

const channelSeed = ["交易所 A", "熟客換匯"];
for (const name of channelSeed) {
  const [existing] = await db.select().from(channels).where(eq(channels.name, name));
  if (!existing) await db.insert(channels).values({ name });
}

const customerSeed = [
  { name: "阿明", receivableTwd: "15800.05" },
  { name: "老王", receivableTwd: "0.00" }
];
for (const item of customerSeed) {
  const [existing] = await db.select().from(customers).where(eq(customers.name, item.name));
  if (!existing) {
    await db.insert(customers).values(item);
  }
}

console.log("Seed completed.");
console.log(`Admin: ${username}`);
console.log(`Operator: ${operatorName} / ${operatorPassword}`);
