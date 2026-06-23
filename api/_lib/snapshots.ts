import { createHash } from "node:crypto";
import { and, count, eq, ne, notInArray, sql } from "drizzle-orm";
import { getDb } from "./db.js";
import { AuditAction, writeAudit, type AuditActor } from "./audit.js";
import { DEPOSIT_CHANNEL } from "./purchaseUtils.js";
import {
  accounts,
  channels,
  customers,
  dailySnapshots,
  ledgerEntries,
  purchases,
  sales
} from "./schema.js";
import { toDbMoney, toDbTwd } from "./money.js";

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export async function computeFinancialSnapshot(snapshotDate = todayDateString()) {
  const db = getDb();
  const depositChannelRows = await db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.name, DEPOSIT_CHANNEL));
  const depositChannelIds = depositChannelRows.map((row) => row.id);
  const excludeDeposit =
    depositChannelIds.length > 0 ? notInArray(purchases.channelId, depositChannelIds) : sql`true`;

  const [[twdRow], [rmbRow], [recvRow], [payableRow], [openSales], [openPurchases], [ledgerCount]] =
    await Promise.all([
      db
        .select({ total: sql<string>`coalesce(sum(${accounts.balance}), 0)` })
        .from(accounts)
        .where(and(eq(accounts.currency, "TWD"), eq(accounts.isActive, true))),
      db
        .select({ total: sql<string>`coalesce(sum(${accounts.balance}), 0)` })
        .from(accounts)
        .where(and(eq(accounts.currency, "RMB"), eq(accounts.isActive, true))),
      db
        .select({
          total: sql<string>`coalesce(sum(case when ${customers.receivableTwd} > 0 then ${customers.receivableTwd} else 0 end), 0)`
        })
        .from(customers),
      db
        .select({ total: sql<string>`coalesce(sum(${purchases.twdCost}), 0)` })
        .from(purchases)
        .where(and(eq(purchases.status, "active"), ne(purchases.paymentStatus, "paid"), excludeDeposit)),
      db
        .select({ total: count() })
        .from(sales)
        .where(and(eq(sales.status, "active"), ne(sales.settlementStatus, "settled"))),
      db
        .select({ total: count() })
        .from(purchases)
        .where(and(eq(purchases.status, "active"), ne(purchases.paymentStatus, "paid"), excludeDeposit)),
      db.select({ total: count() }).from(ledgerEntries)
    ]);

  const [unsettledRmb] = await db
    .select({ total: sql<string>`coalesce(sum(${sales.rmbAmount}), 0)` })
    .from(sales)
    .where(and(eq(sales.status, "active"), ne(sales.settlementStatus, "settled")));

  const payload = {
    snapshotDate,
    totalTwdBalance: toDbTwd(twdRow?.total ?? "0"),
    totalRmbBalance: toDbMoney(rmbRow?.total ?? "0"),
    totalReceivablesTwd: toDbTwd(recvRow?.total ?? "0"),
    totalReceivablesRmb: toDbMoney(unsettledRmb?.total ?? "0"),
    totalPayablesTwd: toDbTwd(payableRow?.total ?? "0"),
    totalPayablesRmb: "0.00",
    openSalesCount: Number(openSales?.total ?? 0),
    openPurchasesCount: Number(openPurchases?.total ?? 0),
    ledgerEntriesCount: Number(ledgerCount?.total ?? 0)
  };

  const checksum = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return { ...payload, checksum };
}

export async function createDailySnapshot(actor?: AuditActor, snapshotDate = todayDateString()) {
  const db = getDb();
  const data = await computeFinancialSnapshot(snapshotDate);

  const [row] = await db
    .insert(dailySnapshots)
    .values({
      snapshotDate: data.snapshotDate,
      totalTwdBalance: data.totalTwdBalance,
      totalRmbBalance: data.totalRmbBalance,
      totalReceivablesTwd: data.totalReceivablesTwd,
      totalReceivablesRmb: data.totalReceivablesRmb,
      totalPayablesTwd: data.totalPayablesTwd,
      totalPayablesRmb: data.totalPayablesRmb,
      openSalesCount: data.openSalesCount,
      openPurchasesCount: data.openPurchasesCount,
      ledgerEntriesCount: data.ledgerEntriesCount,
      checksum: data.checksum
    })
    .onConflictDoUpdate({
      target: dailySnapshots.snapshotDate,
      set: {
        totalTwdBalance: data.totalTwdBalance,
        totalRmbBalance: data.totalRmbBalance,
        totalReceivablesTwd: data.totalReceivablesTwd,
        totalReceivablesRmb: data.totalReceivablesRmb,
        totalPayablesTwd: data.totalPayablesTwd,
        totalPayablesRmb: data.totalPayablesRmb,
        openSalesCount: data.openSalesCount,
        openPurchasesCount: data.openPurchasesCount,
        ledgerEntriesCount: data.ledgerEntriesCount,
        checksum: data.checksum,
        createdAt: new Date()
      }
    })
    .returning();

  await writeAudit(db, {
    action: AuditAction.CREATE_SNAPSHOT,
    targetType: "daily_snapshot",
    targetId: row.id,
    after: row,
    actor
  });

  return row;
}

export async function listDailySnapshots(limit = 90) {
  const db = getDb();
  return db.select().from(dailySnapshots).orderBy(sql`${dailySnapshots.snapshotDate} desc`).limit(limit);
}

export async function getDailySnapshotByDate(date: string) {
  const db = getDb();
  const [row] = await db.select().from(dailySnapshots).where(eq(dailySnapshots.snapshotDate, date));
  return row ?? null;
}

export async function compareDailySnapshots(from: string, to: string) {
  const [fromRow, toRow] = await Promise.all([getDailySnapshotByDate(from), getDailySnapshotByDate(to)]);
  if (!fromRow || !toRow) throw new Error("找不到指定日期的快照");

  const diff = (a: string, b: string) => (Number(b) - Number(a)).toFixed(2);
  return {
    from: fromRow,
    to: toRow,
    delta: {
      totalTwdBalance: diff(String(fromRow.totalTwdBalance), String(toRow.totalTwdBalance)),
      totalRmbBalance: diff(String(fromRow.totalRmbBalance), String(toRow.totalRmbBalance)),
      totalReceivablesTwd: diff(String(fromRow.totalReceivablesTwd), String(toRow.totalReceivablesTwd)),
      totalReceivablesRmb: diff(String(fromRow.totalReceivablesRmb), String(toRow.totalReceivablesRmb)),
      totalPayablesTwd: diff(String(fromRow.totalPayablesTwd), String(toRow.totalPayablesTwd)),
      openSalesCount: toRow.openSalesCount - fromRow.openSalesCount,
      openPurchasesCount: toRow.openPurchasesCount - fromRow.openPurchasesCount,
      ledgerEntriesCount: toRow.ledgerEntriesCount - fromRow.ledgerEntriesCount
    }
  };
}
