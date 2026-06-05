import { sql } from "drizzle-orm";
import { clearBusinessTablesInTx } from "./clearBusiness.js";
import { getDb, type DbTx } from "./db.js";
import {
  accounts,
  channels,
  customers,
  holders,
  ledgerEntries,
  purchases,
  rmbLots,
  saleAllocations,
  sales
} from "./schema.js";

export type BusinessDataImport = {
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
  }[];
};

async function bumpSequence(
  tx: DbTx,
  table: "holders" | "accounts" | "customers" | "channels" | "purchases" | "rmb_lots" | "sales" | "sale_allocations" | "ledger_entries"
) {
  const statements: Record<typeof table, ReturnType<typeof sql>> = {
    holders: sql`SELECT setval(pg_get_serial_sequence('holders', 'id'), COALESCE((SELECT MAX(id) FROM holders), 1))`,
    accounts: sql`SELECT setval(pg_get_serial_sequence('accounts', 'id'), COALESCE((SELECT MAX(id) FROM accounts), 1))`,
    customers: sql`SELECT setval(pg_get_serial_sequence('customers', 'id'), COALESCE((SELECT MAX(id) FROM customers), 1))`,
    channels: sql`SELECT setval(pg_get_serial_sequence('channels', 'id'), COALESCE((SELECT MAX(id) FROM channels), 1))`,
    purchases: sql`SELECT setval(pg_get_serial_sequence('purchases', 'id'), COALESCE((SELECT MAX(id) FROM purchases), 1))`,
    rmb_lots: sql`SELECT setval(pg_get_serial_sequence('rmb_lots', 'id'), COALESCE((SELECT MAX(id) FROM rmb_lots), 1))`,
    sales: sql`SELECT setval(pg_get_serial_sequence('sales', 'id'), COALESCE((SELECT MAX(id) FROM sales), 1))`,
    sale_allocations: sql`SELECT setval(pg_get_serial_sequence('sale_allocations', 'id'), COALESCE((SELECT MAX(id) FROM sale_allocations), 1))`,
    ledger_entries: sql`SELECT setval(pg_get_serial_sequence('ledger_entries', 'id'), COALESCE((SELECT MAX(id) FROM ledger_entries), 1))`
  };
  await tx.execute(statements[table]);
}

export async function importBusinessData(payload: BusinessDataImport, operatorId: number) {
  const db = getDb();
  return db.transaction(async (tx) => {
    await clearBusinessTablesInTx(tx);

  for (const row of payload.holders ?? []) {
    await tx.insert(holders).values({ id: row.id, name: row.name, isActive: row.isActive });
  }
  await bumpSequence(tx, "holders");

  for (const row of payload.accounts ?? []) {
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

  for (const row of payload.customers ?? []) {
    await tx.insert(customers).values({
      id: row.id,
      name: row.name,
      receivableTwd: row.receivableTwd,
      isActive: row.isActive
    });
  }
  await bumpSequence(tx, "customers");

  for (const row of payload.channels ?? []) {
    await tx.insert(channels).values({ id: row.id, name: row.name, isActive: row.isActive });
  }
  await bumpSequence(tx, "channels");

  for (const row of payload.purchases ?? []) {
    const paymentStatus = row.paymentStatus === "paid" ? "paid" : "unpaid";
    await tx.insert(purchases).values({
      id: row.id,
      channelId: row.channelId > 0 ? row.channelId : null,
      paymentAccountId: row.paymentAccountId ?? null,
      depositAccountId: row.depositAccountId,
      rmbAmount: row.rmbAmount,
      exchangeRate: row.exchangeRate,
      twdCost: row.twdCost,
      paymentStatus,
      operatorId,
      createdAt: new Date(row.createdAt)
    });
  }
  await bumpSequence(tx, "purchases");

  for (const row of payload.rmbLots ?? []) {
    await tx.insert(rmbLots).values({
      id: row.id,
      purchaseId: row.purchaseId,
      accountId: row.accountId,
      originalRmb: row.originalRmb,
      remainingRmb: row.remainingRmb,
      unitCostTwd: row.unitCostTwd,
      exchangeRate: row.exchangeRate,
      createdAt: new Date(row.createdAt)
    });
  }
  await bumpSequence(tx, "rmb_lots");

  for (const row of payload.sales ?? []) {
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
      operatorId,
      createdAt: new Date(row.createdAt)
    });
  }
  await bumpSequence(tx, "sales");

  for (const row of payload.saleAllocations ?? []) {
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

  for (const row of payload.ledger ?? []) {
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
      operatorId,
      createdAt: new Date(row.createdAt)
    });
  }
  await bumpSequence(tx, "ledger_entries");
  });
}
