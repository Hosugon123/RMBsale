import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db.js";
import { money, toDbTwd } from "./money.js";
import { type BootstrapSection, wantsSection } from "./bootstrapSections.js";
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
  interest: "利息",
  profit: "分潤",
  "利息": "利息",
  "利潤": "利潤",
  "入金": "入金",
  "撤資": "撤資",
  "分潤": "分潤",
  "內轉": "內轉",
  "應付": "應付",
  "應付付款": "應付付款",
  "買入付款": "買入付款"
};

function mapEntryType(entryType: string) {
  return ENTRY_LABELS[entryType] ?? entryType;
}

function needsOperatorRows(sections?: BootstrapSection[]) {
  return (
    !sections ||
    wantsSection(sections, "users") ||
    wantsSection(sections, "sales") ||
    wantsSection(sections, "purchases") ||
    wantsSection(sections, "ledger")
  );
}

function needsChannelRows(sections?: BootstrapSection[]) {
  return (
    !sections ||
    wantsSection(sections, "channels") ||
    wantsSection(sections, "purchases") ||
    wantsSection(sections, "sales") ||
    wantsSection(sections, "rmbLots")
  );
}

function needsCustomerRows(sections?: BootstrapSection[]) {
  return !sections || wantsSection(sections, "customers") || wantsSection(sections, "sales");
}

function needsPurchaseRows(sections?: BootstrapSection[]) {
  return (
    !sections ||
    wantsSection(sections, "purchases") ||
    wantsSection(sections, "sales") ||
    wantsSection(sections, "rmbLots") ||
    wantsSection(sections, "saleAllocations")
  );
}

export type LedgerLoadMode = "recent" | "full";

export async function loadBootstrapState(
  sessionUserId: number,
  sections?: BootstrapSection[],
  options?: { ledgerMode?: LedgerLoadMode }
) {
  const db = getDb();
  const loadAll = !sections || sections.length === 0;
  const timingLabel = loadAll ? "[bootstrap] full" : `[bootstrap] partial:${sections.join(",")}`;
  console.time(timingLabel);

  try {
    console.time(`${timingLabel} db`);
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
      ledgerRows,
      purchasePaymentRows
    ] = await Promise.all([
      needsOperatorRows(sections)
        ? db.select().from(users).orderBy(asc(users.username))
        : Promise.resolve([]),
      wantsSection(sections, "holders")
        ? db.select().from(holders).orderBy(asc(holders.name))
        : Promise.resolve([]),
      needsCustomerRows(sections)
        ? db.select().from(customers).orderBy(asc(customers.name))
        : Promise.resolve([]),
      needsChannelRows(sections)
        ? db.select().from(channels).orderBy(asc(channels.name))
        : Promise.resolve([]),
      wantsSection(sections, "accounts")
        ? db
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
            .orderBy(asc(holders.name), asc(accounts.currency), asc(accounts.name))
        : Promise.resolve([]),
      wantsSection(sections, "purchases")
        ? db.select().from(purchases).where(eq(purchases.status, "active")).orderBy(desc(purchases.createdAt))
        : needsPurchaseRows(sections)
          ? db
              .select({
                id: purchases.id,
                channelId: purchases.channelId,
                paymentAccountId: purchases.paymentAccountId,
                depositAccountId: purchases.depositAccountId,
                rmbAmount: purchases.rmbAmount,
                exchangeRate: purchases.exchangeRate,
                twdCost: purchases.twdCost,
                paymentStatus: purchases.paymentStatus,
                status: purchases.status,
                operatorId: purchases.operatorId,
                createdAt: purchases.createdAt
              })
              .from(purchases)
              .where(eq(purchases.status, "active"))
          : Promise.resolve([]),
      wantsSection(sections, "sales")
        ? db.select().from(sales).where(eq(sales.status, "active")).orderBy(desc(sales.createdAt))
        : Promise.resolve([]),
      wantsSection(sections, "rmbLots")
        ? db.select().from(rmbLots).orderBy(asc(rmbLots.createdAt))
        : Promise.resolve([]),
      wantsSection(sections, "saleAllocations")
        ? db.select().from(saleAllocations).orderBy(asc(saleAllocations.id))
        : Promise.resolve([]),
      wantsSection(sections, "ledger")
        ? options?.ledgerMode === "full"
          ? db.select().from(ledgerEntries).orderBy(desc(ledgerEntries.createdAt))
          : (async () => {
            const [recentRows, profitRows] = await Promise.all([
              db.select().from(ledgerEntries).orderBy(desc(ledgerEntries.createdAt)).limit(500),
              db
                .select()
                .from(ledgerEntries)
                .where(
                  sql`(
                    ${ledgerEntries.relatedTable} in ('profit', 'opening_profit')
                    or (${ledgerEntries.entryType} = '利潤' and ${ledgerEntries.currency} = 'TWD')
                  )`
                )
                .orderBy(desc(ledgerEntries.createdAt))
            ]);
            const byId = new Map<number, (typeof recentRows)[number]>();
            for (const row of recentRows) byId.set(row.id, row);
            for (const row of profitRows) byId.set(row.id, row);
            return [...byId.values()].sort((a, b) => {
              const byTime = b.createdAt.getTime() - a.createdAt.getTime();
              return byTime !== 0 ? byTime : b.id - a.id;
            });
          })()
        : Promise.resolve([]),
      needsPurchaseRows(sections)
        ? db
            .select({
              purchaseId: ledgerEntries.relatedId,
              paidTwd: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)`
            })
            .from(ledgerEntries)
            .where(
              and(
                eq(ledgerEntries.relatedTable, "purchases"),
                eq(ledgerEntries.direction, "out"),
                eq(ledgerEntries.currency, "TWD"),
                eq(ledgerEntries.isReversal, false)
              )
            )
            .groupBy(ledgerEntries.relatedId)
        : Promise.resolve([])
    ]);
    console.timeEnd(`${timingLabel} db`);

    const operatorMap = new Map(
      userRows.map((row) => [row.id, row.displayName?.trim() || row.username])
    );
    const customerMap = new Map(customerRows.map((row) => [row.id, row.name]));
    const channelMap = new Map(channelRows.map((row) => [row.id, row.name]));
    const purchaseChannelMap = new Map(
      purchaseRows.map((row) => [row.id, row.channelId ? channelMap.get(row.channelId) ?? "未命名渠道" : "未命名渠道"])
    );
    const lotMap = new Map(lotRows.map((row) => [row.id, row]));
    const purchasePaymentMap = new Map(
      purchasePaymentRows
        .filter((row) => row.purchaseId != null)
        .map((row) => [row.purchaseId as number, row.paidTwd])
    );

    const result: Record<string, unknown> & { sessionUserId: number } = {
      sessionUserId
    };

    if (loadAll || wantsSection(sections, "users")) {
      result.users = userRows.map((row) => toAppUser(row));
    }
    if (loadAll || wantsSection(sections, "holders")) {
      result.holders = holderRows.map((row) => ({
        id: row.id,
        name: row.name,
        isActive: row.isActive
      }));
    }
    if (loadAll || wantsSection(sections, "accounts")) {
      result.accounts = accountRows.map((row) => ({
        id: row.id,
        holderId: row.holderId,
        holderName: row.holderName,
        name: row.name,
        currency: row.currency,
        balance: String(row.balance),
        profitBalance: String(row.profitBalance),
        isActive: row.isActive
      }));
    }
    if (loadAll || wantsSection(sections, "customers")) {
      result.customers = customerRows.map((row) => ({
        id: row.id,
        name: row.name,
        receivableTwd: String(row.receivableTwd),
        isActive: row.isActive
      }));
    }
    if (loadAll || wantsSection(sections, "channels")) {
      result.channels = channelRows.map((row) => ({
        id: row.id,
        name: row.name,
        isActive: row.isActive
      }));
    }
    if (loadAll || wantsSection(sections, "purchases")) {
      result.purchases = purchaseRows.map((row) => {
        const rawPaidTwd = purchasePaymentMap.get(row.id) ?? (row.paymentStatus === "paid" ? String(row.twdCost) : "0.00");
        const paidAmount = money(rawPaidTwd);
        const costAmount = money(row.twdCost);
        const paidTwd = toDbTwd(paidAmount.gt(costAmount) ? costAmount : paidAmount);
        const paymentStatus = paidAmount.gte(costAmount) ? "paid" : paidAmount.gt(0) ? "partial" : "unpaid";
        return {
        id: row.id,
        channelId: row.channelId ?? 0,
        channelName: purchaseChannelMap.get(row.id) ?? "未命名渠道",
        paymentAccountId: row.paymentAccountId ?? undefined,
        depositAccountId: row.depositAccountId,
        rmbAmount: String(row.rmbAmount),
        exchangeRate: String(row.exchangeRate),
        twdCost: String(row.twdCost),
        paidTwd,
        paymentStatus,
        status: row.status as "active" | "reversed",
        operatorName: operatorMap.get(row.operatorId) ?? "未知",
        createdAt: row.createdAt.toISOString()
        };
      });
    }
    if (loadAll || wantsSection(sections, "sales")) {
      result.sales = saleRows.map((row) => ({
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
        status: row.status as "active" | "reversed",
        operatorName: operatorMap.get(row.operatorId) ?? "未知",
        createdAt: row.createdAt.toISOString()
      }));
    }
    if (loadAll || wantsSection(sections, "saleAllocations")) {
      result.saleAllocations = allocationRows.map((row) => {
        const lot = lotMap.get(row.lotId);
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
      });
    }
    if (loadAll || wantsSection(sections, "rmbLots")) {
      result.rmbLots = lotRows.map((row) => ({
        id: row.id,
        purchaseId: row.purchaseId,
        accountId: row.accountId,
        channelName: purchaseChannelMap.get(row.purchaseId) ?? "",
        originalRmb: String(row.originalRmb),
        remainingRmb: String(row.remainingRmb),
        unitCostTwd: String(row.unitCostTwd),
        exchangeRate: String(row.exchangeRate),
        transferId: row.transferId ?? undefined,
        createdAt: row.createdAt.toISOString()
      }));
    }
    if (loadAll || wantsSection(sections, "ledger")) {
      result.ledger = ledgerRows.map((row) => ({
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
        relatedId: row.relatedId ?? undefined,
        isReversal: row.isReversal,
        reversesLedgerId: row.reversesLedgerId ?? undefined
      }));
    }

    return result;
  } finally {
    console.timeEnd(timingLabel);
  }
}

export async function loadFullBootstrapState(sessionUserId: number) {
  return loadBootstrapState(sessionUserId, undefined, { ledgerMode: "full" }) as Promise<
    Awaited<ReturnType<typeof loadBootstrapState>> & {
      users: NonNullable<Awaited<ReturnType<typeof loadBootstrapState>>["users"]>;
      holders: NonNullable<Awaited<ReturnType<typeof loadBootstrapState>>["holders"]>;
      accounts: NonNullable<Awaited<ReturnType<typeof loadBootstrapState>>["accounts"]>;
      customers: NonNullable<Awaited<ReturnType<typeof loadBootstrapState>>["customers"]>;
      channels: NonNullable<Awaited<ReturnType<typeof loadBootstrapState>>["channels"]>;
      purchases: NonNullable<Awaited<ReturnType<typeof loadBootstrapState>>["purchases"]>;
      sales: NonNullable<Awaited<ReturnType<typeof loadBootstrapState>>["sales"]>;
      saleAllocations: NonNullable<Awaited<ReturnType<typeof loadBootstrapState>>["saleAllocations"]>;
      rmbLots: NonNullable<Awaited<ReturnType<typeof loadBootstrapState>>["rmbLots"]>;
      ledger: NonNullable<Awaited<ReturnType<typeof loadBootstrapState>>["ledger"]>;
    }
  >;
}
