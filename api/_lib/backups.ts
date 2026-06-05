import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "./db.js";
import { AuditAction, writeAudit, type AuditActor } from "./audit.js";
import { createDailySnapshot } from "./snapshots.js";
import {
  accounts,
  auditLogs,
  backupRuns,
  channels,
  customers,
  dailySnapshots,
  holders,
  ledgerEntries,
  purchases,
  rmbLots,
  saleAllocations,
  sales,
  settlements,
  transfers,
  users
} from "./schema.js";

export type BackupType = "manual" | "daily" | "monthly";

export function getBackupStorageMode(): "local" | "gcs" {
  return process.env.BACKUP_STORAGE === "gcs" ? "gcs" : "local";
}

function backupFileName(type: BackupType) {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const suffix = type === "monthly" ? "_monthly" : "";
  return `rmbsale_backup_${stamp}${suffix}.json`;
}

function monthRange(month: string) {
  const [year, mon] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  return { start, end };
}

export async function exportBackupPayload(type: BackupType = "manual") {
  const db = getDb();
  const [
    userRows,
    holderRows,
    customerRows,
    channelRows,
    accountRows,
    purchaseRows,
    saleRows,
    lotRows,
    allocationRows,
    settlementRows,
    transferRows,
    ledgerRows,
    auditRows,
    snapshotRows
  ] = await Promise.all([
    db.select().from(users),
    db.select().from(holders),
    db.select().from(customers),
    db.select().from(channels),
    db.select().from(accounts),
    db.select().from(purchases),
    db.select().from(sales),
    db.select().from(rmbLots),
    db.select().from(saleAllocations),
    db.select().from(settlements),
    db.select().from(transfers),
    db.select().from(ledgerEntries).orderBy(desc(ledgerEntries.createdAt)),
    db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(5000),
    db.select().from(dailySnapshots).orderBy(desc(dailySnapshots.snapshotDate)).limit(365)
  ]);

  const payload: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    type,
    storageMode: getBackupStorageMode(),
    data: {
      users: userRows,
      holders: holderRows,
      customers: customerRows,
      channels: channelRows,
      accounts: accountRows,
      purchases: purchaseRows,
      sales: saleRows,
      inventory: lotRows,
      sale_allocations: allocationRows,
      settlements: settlementRows,
      transfers: transferRows,
      ledger_entries: ledgerRows,
      audit_logs: auditRows,
      daily_snapshots: snapshotRows
    }
  };

  if (type === "monthly") {
    const month = new Date().toISOString().slice(0, 7);
    const { start, end } = monthRange(month);
    const [monthSales, monthPurchases, monthLedger, monthAudit] = await Promise.all([
      db.select().from(sales).where(and(gte(sales.createdAt, start), lt(sales.createdAt, end))),
      db.select().from(purchases).where(and(gte(purchases.createdAt, start), lt(purchases.createdAt, end))),
      db
        .select()
        .from(ledgerEntries)
        .where(and(gte(ledgerEntries.createdAt, start), lt(ledgerEntries.createdAt, end))),
      db.select().from(auditLogs).where(and(gte(auditLogs.createdAt, start), lt(auditLogs.createdAt, end)))
    ]);
    payload.monthlySummary = {
      month,
      salesCount: monthSales.length,
      purchasesCount: monthPurchases.length,
      ledgerCount: monthLedger.length,
      auditCount: monthAudit.length
    };
    payload.data = {
      ...(payload.data as Record<string, unknown>),
      month_sales: monthSales,
      month_purchases: monthPurchases,
      month_ledger_entries: monthLedger,
      month_audit_logs: monthAudit
    };
  }

  return payload;
}

async function saveToLocal(fileName: string, content: string) {
  const dir = path.join(tmpdir(), "rmbsale-backups");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const fullPath = path.join(dir, fileName);
  await writeFile(fullPath, content, "utf8");
  return { storageTarget: "local", storagePath: fullPath, warning: "備份僅存於 /tmp，請盡快下載" };
}

async function saveToGcs(fileName: string, content: string) {
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) throw new Error("GCS_BUCKET_NAME 未設定");

  const { Storage } = await import("@google-cloud/storage");
  const storage = new Storage();
  const objectPath = `backups/${fileName}`;
  const file = storage.bucket(bucketName).file(objectPath);
  await file.save(content, { contentType: "application/json" });
  return { storageTarget: "gcs", storagePath: `gs://${bucketName}/${objectPath}` };
}

export async function runBackup(type: BackupType, actor?: AuditActor) {
  const db = getDb();
  const startedAt = new Date();
  const [run] = await db
    .insert(backupRuns)
    .values({
      type,
      status: "running",
      startedAt,
      storageTarget: getBackupStorageMode(),
      createdBy: actor?.id ?? null
    })
    .returning();

  try {
    const payload = await exportBackupPayload(type);
    const content = JSON.stringify(payload, null, 2);
    const fileName = backupFileName(type);
    const saved =
      getBackupStorageMode() === "gcs"
        ? await saveToGcs(fileName, content)
        : await saveToLocal(fileName, content);

    const [finished] = await db
      .update(backupRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        fileName,
        fileSize: Buffer.byteLength(content, "utf8"),
        storageTarget: saved.storageTarget,
        storagePath: saved.storagePath
      })
      .where(eq(backupRuns.id, run.id))
      .returning();

    await writeAudit(db, {
      action: type === "manual" ? AuditAction.RUN_BACKUP : AuditAction.SCHEDULED_BACKUP,
      targetType: "backup_run",
      targetId: finished.id,
      after: finished,
      actor
    });

    return { run: finished, warning: "warning" in saved ? saved.warning : undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : "備份失敗";
    const [failed] = await db
      .update(backupRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        errorMessage: message
      })
      .where(eq(backupRuns.id, run.id))
      .returning();
    throw Object.assign(new Error(message), { run: failed });
  }
}

export async function runScheduledBackup(type: "daily" | "monthly", actor?: AuditActor) {
  await createDailySnapshot(actor);
  return runBackup(type, actor);
}

export async function listBackupRuns(limit = 50) {
  const db = getDb();
  return db.select().from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(limit);
}

export async function getBackupRun(id: number) {
  const db = getDb();
  const [row] = await db.select().from(backupRuns).where(eq(backupRuns.id, id));
  return row ?? null;
}

export async function readBackupFile(run: typeof backupRuns.$inferSelect) {
  if (!run.storagePath) throw new Error("備份檔案路徑不存在");
  if (run.storageTarget === "local") {
    return readFile(run.storagePath, "utf8");
  }
  if (run.storageTarget === "gcs") {
    const bucketName = process.env.GCS_BUCKET_NAME;
    if (!bucketName) throw new Error("GCS_BUCKET_NAME 未設定");
    const objectPath = run.storagePath.replace(`gs://${bucketName}/`, "");
    const { Storage } = await import("@google-cloud/storage");
    const storage = new Storage();
    const [buf] = await storage.bucket(bucketName).file(objectPath).download();
    return buf.toString("utf8");
  }
  throw new Error("不支援的備份儲存類型");
}
