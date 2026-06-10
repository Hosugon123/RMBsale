import "./loadEnv.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { getDb, type DbTx } from "../api/_lib/db";
import {
  accounts,
  channels,
  customers,
  holders,
  ledgerEntries,
  purchases,
  rmbLots,
  saleAllocations,
  sales,
  settlements,
  transfers,
  users
} from "../api/_lib/schema";

type DbSnapshot = {
  users?: {
    id: number;
    username: string;
    passwordHash: string;
    displayName: string | null;
    permissionsJson: string | null;
    role: "admin" | "operator";
    isActive: boolean;
    createdAt: string;
  }[];
  holders?: { id: number; name: string; isActive: boolean }[];
  accounts?: {
    id: number;
    holderId: number;
    name: string;
    currency: "TWD" | "RMB";
    balance: string;
    profitBalance: string;
    isActive: boolean;
  }[];
  customers?: { id: number; name: string; receivableTwd: string; isActive: boolean }[];
  channels?: { id: number; name: string; isActive: boolean }[];
  purchases?: {
    id: number;
    channelId: number;
    paymentAccountId?: number;
    depositAccountId: number;
    rmbAmount: string;
    exchangeRate: string;
    twdCost: string;
    paymentStatus: string;
    status?: string;
    operatorId: number;
    createdAt: string;
  }[];
  rmbLots?: {
    id: number;
    purchaseId: number;
    accountId: number;
    originalRmb: string;
    remainingRmb: string;
    unitCostTwd: string;
    exchangeRate: string;
    transferId?: number;
    createdAt: string;
  }[];
  sales?: {
    id: number;
    customerId: number;
    rmbAccountId: number;
    rmbAmount: string;
    exchangeRate: string;
    twdAmount: string;
    costTwd: string;
    profitTwd: string;
    settlementStatus: string;
    status?: string;
    operatorId: number;
    createdAt: string;
  }[];
  saleAllocations?: {
    id: number;
    saleId: number;
    lotId: number;
    allocatedRmb: string;
    allocatedCostTwd: string;
    createdAt: string;
  }[];
  settlements?: {
    id: number;
    customerId: number;
    accountId: number;
    amountTwd: string;
    note: string | null;
    status: "active" | "reversed";
    operatorId: number;
    createdAt: string;
  }[];
  transfers?: {
    id: number;
    fromAccountId: number;
    toAccountId: number;
    amount: string;
    note: string | null;
    status: "active" | "reversed";
    operatorId: number;
    createdAt: string;
  }[];
  ledger?: {
    id: number;
    createdAt: string;
    entryType: string;
    accountId?: number;
    customerId?: number;
    direction: "in" | "out" | "none";
    currency: "TWD" | "RMB";
    amount: string;
    description: string;
    relatedTable?: string;
    relatedId?: number;
    balanceBefore?: string;
    balanceAfter?: string;
    isReversal?: boolean;
    reversesLedgerId?: number;
    operatorId: number;
  }[];
};

async function bumpSequence(
  tx: DbTx,
  table:
    | "users"
    | "holders"
    | "accounts"
    | "customers"
    | "channels"
    | "purchases"
    | "rmb_lots"
    | "sales"
    | "sale_allocations"
    | "settlements"
    | "transfers"
    | "ledger_entries"
) {
  await tx.execute(
    sql.raw(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1))`)
  );
}

const inputPath = resolve(process.argv[2] ?? "data/db-snapshot.json");
const snapshot = JSON.parse(readFileSync(inputPath, "utf8")) as DbSnapshot;
const db = getDb();

await db.transaction(async (tx) => {
  await tx.execute(
    sql`TRUNCATE TABLE audit_logs, backup_runs, daily_snapshots, settlements, transfers, sale_allocations, ledger_entries, rmb_lots, sales, purchases, accounts, customers, channels, holders, users RESTART IDENTITY CASCADE`
  );

  for (const row of snapshot.users ?? []) {
    await tx.insert(users).values({
      id: row.id,
      username: row.username,
      passwordHash: row.passwordHash,
      displayName: row.displayName,
      permissionsJson: row.permissionsJson,
      role: row.role,
      isActive: row.isActive,
      createdAt: new Date(row.createdAt)
    });
  }
  await bumpSequence(tx, "users");

  for (const row of snapshot.holders ?? []) {
    await tx.insert(holders).values({ id: row.id, name: row.name, isActive: row.isActive });
  }
  await bumpSequence(tx, "holders");

  for (const row of snapshot.accounts ?? []) {
    await tx.insert(accounts).values({
      id: row.id,
      holderId: row.holderId,
      name: row.name,
      currency: row.currency,
      balance: row.balance,
      profitBalance: row.profitBalance,
      isActive: row.isActive
    });
  }
  await bumpSequence(tx, "accounts");

  for (const row of snapshot.customers ?? []) {
    await tx.insert(customers).values({
      id: row.id,
      name: row.name,
      receivableTwd: row.receivableTwd,
      isActive: row.isActive
    });
  }
  await bumpSequence(tx, "customers");

  for (const row of snapshot.channels ?? []) {
    await tx.insert(channels).values({ id: row.id, name: row.name, isActive: row.isActive });
  }
  await bumpSequence(tx, "channels");

  for (const row of snapshot.purchases ?? []) {
    await tx.insert(purchases).values({
      id: row.id,
      channelId: row.channelId > 0 ? row.channelId : null,
      paymentAccountId: row.paymentAccountId ?? null,
      depositAccountId: row.depositAccountId,
      rmbAmount: row.rmbAmount,
      exchangeRate: row.exchangeRate,
      twdCost: row.twdCost,
      paymentStatus: row.paymentStatus === "paid" ? "paid" : "unpaid",
      status: row.status === "reversed" ? "reversed" : "active",
      operatorId: row.operatorId,
      createdAt: new Date(row.createdAt)
    });
  }
  await bumpSequence(tx, "purchases");

  for (const row of snapshot.rmbLots ?? []) {
    await tx.insert(rmbLots).values({
      id: row.id,
      purchaseId: row.purchaseId,
      accountId: row.accountId,
      originalRmb: row.originalRmb,
      remainingRmb: row.remainingRmb,
      unitCostTwd: row.unitCostTwd,
      exchangeRate: row.exchangeRate,
      transferId: row.transferId ?? null,
      createdAt: new Date(row.createdAt)
    });
  }
  await bumpSequence(tx, "rmb_lots");

  for (const row of snapshot.sales ?? []) {
    const settlementStatus =
      row.settlementStatus === "settled" || row.settlementStatus === "partial"
        ? row.settlementStatus
        : "unsettled";
    await tx.insert(sales).values({
      id: row.id,
      customerId: row.customerId,
      rmbAccountId: row.rmbAccountId,
      rmbAmount: row.rmbAmount,
      exchangeRate: row.exchangeRate,
      twdAmount: row.twdAmount,
      costTwd: row.costTwd,
      profitTwd: row.profitTwd,
      settlementStatus,
      status: row.status === "reversed" ? "reversed" : "active",
      operatorId: row.operatorId,
      createdAt: new Date(row.createdAt)
    });
  }
  await bumpSequence(tx, "sales");

  for (const row of snapshot.saleAllocations ?? []) {
    await tx.insert(saleAllocations).values({
      id: row.id,
      saleId: row.saleId,
      lotId: row.lotId,
      allocatedRmb: row.allocatedRmb,
      allocatedCostTwd: row.allocatedCostTwd,
      createdAt: new Date(row.createdAt)
    });
  }
  await bumpSequence(tx, "sale_allocations");

  for (const row of snapshot.settlements ?? []) {
    await tx.insert(settlements).values({
      id: row.id,
      customerId: row.customerId,
      accountId: row.accountId,
      amountTwd: row.amountTwd,
      note: row.note,
      status: row.status,
      operatorId: row.operatorId,
      createdAt: new Date(row.createdAt)
    });
  }
  await bumpSequence(tx, "settlements");

  for (const row of snapshot.transfers ?? []) {
    await tx.insert(transfers).values({
      id: row.id,
      fromAccountId: row.fromAccountId,
      toAccountId: row.toAccountId,
      amount: row.amount,
      note: row.note,
      status: row.status,
      operatorId: row.operatorId,
      createdAt: new Date(row.createdAt)
    });
  }
  await bumpSequence(tx, "transfers");

  for (const row of snapshot.ledger ?? []) {
    await tx.insert(ledgerEntries).values({
      id: row.id,
      entryType: row.entryType,
      accountId: row.accountId ?? null,
      customerId: row.customerId ?? null,
      relatedTable: row.relatedTable ?? null,
      relatedId: row.relatedId ?? null,
      direction: row.direction,
      currency: row.currency,
      amount: row.amount,
      balanceBefore: row.balanceBefore ?? null,
      balanceAfter: row.balanceAfter ?? null,
      description: row.description,
      isReversal: row.isReversal ?? false,
      reversesLedgerId: row.reversesLedgerId ?? null,
      operatorId: row.operatorId,
      createdAt: new Date(row.createdAt)
    });
  }
  await bumpSequence(tx, "ledger_entries");
});

console.log("已匯入資料庫快照：", inputPath);
