import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "./db.js";
import { ensureUserProfileColumns } from "./ensureUserColumns.js";
import { toAppUser } from "./userPermissions.js";
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
  users
} from "./schema.js";

const ENTRY_LABELS: Record<string, string> = {
  purchase: "買入",
  sale: "售出",
  transfer: "轉帳",
  settlement: "收帳",
  receivable: "應收",
  profit: "分潤",
  "入金": "入金",
  "撤資": "撤資",
  "分潤": "分潤",
  "內轉": "內轉",
  "應付付款": "應付付款"
};

function mapEntryType(entryType: string) {
  return ENTRY_LABELS[entryType] ?? entryType;
}

export async function loadBootstrapState(sessionUserId: number) {
  await ensureUserProfileColumns();
  const db = getDb();
  const [userRows, holderRows, customerRows, channelRows, accountRows, purchaseRows, saleRows, lotRows, allocationRows, ledgerRows] =
    await Promise.all([
      db.select().from(users).orderBy(asc(users.username)),
      db.select().from(holders).orderBy(asc(holders.name)),
      db.select().from(customers).orderBy(asc(customers.name)),
      db.select().from(channels).orderBy(asc(channels.name)),
      db
        .select({
          id: accounts.id,
          holderId: accounts.holderId,
          holderName: holders.name,
          name: accounts.name,
          currency: accounts.currency,
          balance: accounts.balance,
          profitBalance: accounts.profitBalance,
          isActive: accounts.isActive
        })
        .from(accounts)
        .innerJoin(holders, eq(accounts.holderId, holders.id))
        .orderBy(asc(holders.name), asc(accounts.currency), asc(accounts.name)),
      db.select().from(purchases).where(eq(purchases.status, "active")).orderBy(desc(purchases.createdAt)),
      db.select().from(sales).where(eq(sales.status, "active")).orderBy(desc(sales.createdAt)),
      db.select().from(rmbLots).orderBy(asc(rmbLots.createdAt)),
      db.select().from(saleAllocations).orderBy(asc(saleAllocations.id)),
      db.select().from(ledgerEntries).orderBy(desc(ledgerEntries.createdAt)).limit(500)
    ]);

  const operatorMap = new Map(
    userRows.map((row) => [row.id, row.displayName?.trim() || row.username])
  );
  const customerMap = new Map(customerRows.map((row) => [row.id, row.name]));
  const channelMap = new Map(channelRows.map((row) => [row.id, row.name]));
  const purchaseChannelMap = new Map(
    purchaseRows.map((row) => [row.id, row.channelId ? channelMap.get(row.channelId) ?? "未命名渠道" : "未命名渠道"])
  );

  return {
    sessionUserId,
    users: userRows.map((row) => toAppUser(row)),
    holders: holderRows.map((row) => ({
      id: row.id,
      name: row.name,
      isActive: row.isActive
    })),
    accounts: accountRows.map((row) => ({
      id: row.id,
      holderId: row.holderId,
      holderName: row.holderName,
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
      channelName: purchaseChannelMap.get(row.id) ?? "未命名渠道",
      paymentAccountId: row.paymentAccountId ?? undefined,
      depositAccountId: row.depositAccountId,
      rmbAmount: String(row.rmbAmount),
      exchangeRate: String(row.exchangeRate),
      twdCost: String(row.twdCost),
      paidTwd: row.paymentStatus === "paid" ? String(row.twdCost) : "0.00",
      paymentStatus: row.paymentStatus as "paid" | "unpaid",
      operatorName: operatorMap.get(row.operatorId) ?? "未知",
      createdAt: row.createdAt.toISOString()
    })),
    sales: saleRows.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      customerName: customerMap.get(row.customerId) ?? "未知客戶",
      rmbAccountId: row.rmbAccountId,
      rmbAmount: String(row.rmbAmount),
      exchangeRate: String(row.exchangeRate),
      twdAmount: String(row.twdAmount),
      costTwd: String(row.costTwd),
      profitTwd: String(row.profitTwd),
      settlementStatus: row.settlementStatus,
      operatorName: operatorMap.get(row.operatorId) ?? "未知",
      createdAt: row.createdAt.toISOString()
    })),
    saleAllocations: allocationRows.map((row) => {
      const lot = lotRows.find((item) => item.id === row.lotId);
      return {
        id: row.id,
        saleId: row.saleId,
        lotId: row.lotId,
        purchaseId: lot?.purchaseId ?? 0,
        channelName: lot ? purchaseChannelMap.get(lot.purchaseId) ?? "" : "",
        allocatedRmb: String(row.allocatedRmb),
        unitCostTwd: lot ? String(lot.unitCostTwd) : "0",
        costTwd: String(row.allocatedCostTwd),
        createdAt: row.createdAt.toISOString()
      };
    }),
    rmbLots: lotRows.map((row) => ({
      id: row.id,
      purchaseId: row.purchaseId,
      accountId: row.accountId,
      channelName: purchaseChannelMap.get(row.purchaseId) ?? "",
      originalRmb: String(row.originalRmb),
      remainingRmb: String(row.remainingRmb),
      unitCostTwd: String(row.unitCostTwd),
      exchangeRate: String(row.exchangeRate),
      createdAt: row.createdAt.toISOString()
    })),
    ledger: ledgerRows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      entryType: mapEntryType(row.entryType),
      accountId: row.accountId ?? undefined,
      customerId: row.customerId ?? undefined,
      direction: row.direction,
      currency: row.currency,
      amount: String(row.amount),
      description: row.description,
      operatorName: operatorMap.get(row.operatorId) ?? "未知",
      relatedTable: row.relatedTable ?? undefined,
      relatedId: row.relatedId ?? undefined
    }))
  };
}
