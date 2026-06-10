import "./loadEnv.ts";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { desc } from "drizzle-orm";
import { getDb } from "../api/_lib/db";
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

const outputPath = resolve(process.argv[2] ?? "data/db-snapshot.json");

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
  ledgerRows
] = await Promise.all([
  db.select().from(users).orderBy(users.id),
  db.select().from(holders).orderBy(holders.id),
  db.select().from(customers).orderBy(customers.id),
  db.select().from(channels).orderBy(channels.id),
  db.select().from(accounts).orderBy(accounts.id),
  db.select().from(purchases).orderBy(desc(purchases.createdAt)),
  db.select().from(sales).orderBy(desc(sales.createdAt)),
  db.select().from(rmbLots).orderBy(rmbLots.id),
  db.select().from(saleAllocations).orderBy(saleAllocations.id),
  db.select().from(settlements).orderBy(desc(settlements.createdAt)),
  db.select().from(transfers).orderBy(desc(transfers.createdAt)),
  db.select().from(ledgerEntries).orderBy(desc(ledgerEntries.createdAt))
]);

const snapshot = {
  exportedAt: new Date().toISOString(),
  users: userRows.map((row) => ({
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    permissionsJson: row.permissionsJson,
    role: row.role,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString()
  })),
  holders: holderRows.map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.isActive
  })),
  accounts: accountRows.map((row) => ({
    id: row.id,
    holderId: row.holderId,
    name: row.name,
    currency: row.currency,
    balance: String(row.balance),
    profitBalance: String(row.profitBalance),
    isActive: row.isActive
  })),
  customers: customerRows.map((row) => ({
    id: row.id,
    name: row.name,
    receivableTwd: String(row.receivableTwd),
    isActive: row.isActive
  })),
  channels: channelRows.map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.isActive
  })),
  purchases: purchaseRows.map((row) => ({
    id: row.id,
    channelId: row.channelId ?? 0,
    paymentAccountId: row.paymentAccountId ?? undefined,
    depositAccountId: row.depositAccountId,
    rmbAmount: String(row.rmbAmount),
    exchangeRate: String(row.exchangeRate),
    twdCost: String(row.twdCost),
    paymentStatus: row.paymentStatus,
    status: row.status,
    operatorId: row.operatorId,
    createdAt: row.createdAt.toISOString()
  })),
  rmbLots: lotRows.map((row) => ({
    id: row.id,
    purchaseId: row.purchaseId,
    accountId: row.accountId,
    originalRmb: String(row.originalRmb),
    remainingRmb: String(row.remainingRmb),
    unitCostTwd: String(row.unitCostTwd),
    exchangeRate: String(row.exchangeRate),
    transferId: row.transferId ?? undefined,
    createdAt: row.createdAt.toISOString()
  })),
  sales: saleRows.map((row) => ({
    id: row.id,
    customerId: row.customerId,
    rmbAccountId: row.rmbAccountId,
    rmbAmount: String(row.rmbAmount),
    exchangeRate: String(row.exchangeRate),
    twdAmount: String(row.twdAmount),
    costTwd: String(row.costTwd),
    profitTwd: String(row.profitTwd),
    settlementStatus: row.settlementStatus,
    status: row.status,
    operatorId: row.operatorId,
    createdAt: row.createdAt.toISOString()
  })),
  saleAllocations: allocationRows.map((row) => ({
    id: row.id,
    saleId: row.saleId,
    lotId: row.lotId,
    allocatedRmb: String(row.allocatedRmb),
    allocatedCostTwd: String(row.allocatedCostTwd),
    createdAt: row.createdAt.toISOString()
  })),
  settlements: settlementRows.map((row) => ({
    id: row.id,
    customerId: row.customerId,
    accountId: row.accountId,
    amountTwd: String(row.amountTwd),
    note: row.note,
    status: row.status,
    operatorId: row.operatorId,
    createdAt: row.createdAt.toISOString()
  })),
  transfers: transferRows.map((row) => ({
    id: row.id,
    fromAccountId: row.fromAccountId,
    toAccountId: row.toAccountId,
    amount: String(row.amount),
    note: row.note,
    status: row.status,
    operatorId: row.operatorId,
    createdAt: row.createdAt.toISOString()
  })),
  ledger: ledgerRows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    entryType: row.entryType,
    accountId: row.accountId ?? undefined,
    customerId: row.customerId ?? undefined,
    direction: row.direction,
    currency: row.currency,
    amount: String(row.amount),
    description: row.description,
    relatedTable: row.relatedTable ?? undefined,
    relatedId: row.relatedId ?? undefined,
    balanceBefore: row.balanceBefore != null ? String(row.balanceBefore) : undefined,
    balanceAfter: row.balanceAfter != null ? String(row.balanceAfter) : undefined,
    isReversal: row.isReversal,
    reversesLedgerId: row.reversesLedgerId ?? undefined,
    operatorId: row.operatorId
  }))
};

writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), "utf8");
console.log("已匯出資料庫快照：", outputPath);
console.log({
  users: snapshot.users.length,
  holders: snapshot.holders.length,
  accounts: snapshot.accounts.length,
  customers: snapshot.customers.length,
  channels: snapshot.channels.length,
  purchases: snapshot.purchases.length,
  sales: snapshot.sales.length,
  rmbLots: snapshot.rmbLots.length,
  saleAllocations: snapshot.saleAllocations.length,
  settlements: snapshot.settlements.length,
  transfers: snapshot.transfers.length,
  ledger: snapshot.ledger.length
});
