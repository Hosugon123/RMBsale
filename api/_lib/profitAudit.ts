import { and, eq } from "drizzle-orm";
import Decimal from "decimal.js";
import type { DbTx } from "./db.js";
import { money, toDbMoney, toDbTwd, twdMoney } from "./money.js";
import { customers, ledgerEntries, purchases, rmbLots, saleAllocations, sales } from "./schema.js";

type RowDate = Date | string;

export type ProfitAuditSaleRow = {
  id: number;
  customerId: number;
  rmbAmount: string;
  exchangeRate: string;
  twdAmount: string;
  costTwd: string;
  profitTwd: string;
  status: string;
  createdAt: RowDate;
};

export type ProfitAuditLotRow = {
  id: number;
  purchaseId: number;
  originalRmb: string;
  unitCostTwd: string;
  createdAt: RowDate;
};

export type ProfitAuditPurchaseRow = {
  id: number;
  status: string;
};

export type ProfitAuditAllocationRow = {
  id: number;
  saleId: number;
  lotId: number;
  allocatedRmb: string;
  allocatedCostTwd: string;
};

export type ProfitAuditLedgerRow = {
  id: number;
  entryType: string;
  relatedTable: string | null;
  relatedId: number | null;
  direction: string;
  currency: string;
  amount: string;
  isReversal: boolean;
  reversesLedgerId: number | null;
};

export type ProfitAuditCustomerRow = {
  id: number;
  name: string;
};

export type ProfitAuditInput = {
  sales: ProfitAuditSaleRow[];
  lots: ProfitAuditLotRow[];
  purchases: ProfitAuditPurchaseRow[];
  allocations: ProfitAuditAllocationRow[];
  ledgerEntries: ProfitAuditLedgerRow[];
  customers: ProfitAuditCustomerRow[];
};

export type ProfitAuditIssueKind =
  | "revenue_mismatch"
  | "allocation_rmb_mismatch"
  | "allocation_cost_mismatch"
  | "sale_cost_mismatch"
  | "sale_profit_mismatch"
  | "profit_ledger_missing"
  | "profit_ledger_duplicate"
  | "profit_ledger_amount_mismatch"
  | "fifo_replay_mismatch"
  | "fifo_replay_shortfall"
  | "missing_lot"
  | "suspicious_lot_cost";

export type ProfitAuditIssue = {
  kind: ProfitAuditIssueKind;
  severity: "warning" | "error";
  saleId?: number;
  saleDate?: string;
  customerName?: string;
  message: string;
  expected?: string;
  actual?: string;
  details?: Record<string, string | number | null | undefined>;
};

export type ProfitAuditReport = {
  generatedAt: string;
  status: "ok" | "has_issues";
  totals: {
    salesAudited: number;
    issueSales: number;
    issues: number;
    storedSaleProfitTwd: string;
    recalculatedSaleProfitTwd: string;
    saleProfitDeltaTwd: string;
    storedAvailableProfitTwd: string;
    recalculatedAvailableProfitTwd: string;
    availableProfitDeltaTwd: string;
    suspiciousLots: number;
  };
  issues: ProfitAuditIssue[];
};

function timeOf(value: RowDate) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function isoDate(value: RowDate) {
  return new Date(value).toISOString();
}

function eqMoney(left: Decimal.Value, right: Decimal.Value) {
  return toDbTwd(left) === toDbTwd(right);
}

function saleLabel(sale: ProfitAuditSaleRow, customerNameById: Map<number, string>) {
  return {
    saleId: sale.id,
    saleDate: isoDate(sale.createdAt),
    customerName: customerNameById.get(sale.customerId) ?? "未命名客戶"
  };
}

function addIssue(
  issues: ProfitAuditIssue[],
  sale: ProfitAuditSaleRow | null,
  customerNameById: Map<number, string>,
  issue: Omit<ProfitAuditIssue, "saleId" | "saleDate" | "customerName">
) {
  issues.push({
    ...(sale ? saleLabel(sale, customerNameById) : {}),
    ...issue
  });
}

function mapById<T extends { id: number }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function groupBy<T, K>(rows: T[], getKey: (row: T) => K) {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const key = getKey(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }
  return grouped;
}

function summarizeAllocations(rows: ProfitAuditAllocationRow[]) {
  const byLot = new Map<number, Decimal>();
  for (const row of rows) {
    byLot.set(row.lotId, (byLot.get(row.lotId) ?? money(0)).add(row.allocatedRmb));
  }
  return [...byLot.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lotId, amount]) => `${lotId}:${toDbMoney(amount)}`)
    .join(",");
}

function expectedFifoAllocations(
  sale: ProfitAuditSaleRow,
  virtualLots: Array<ProfitAuditLotRow & { availableRmb: Decimal }>
) {
  let remaining = money(sale.rmbAmount);
  const rows: Array<{ lotId: number; allocatedRmb: string }> = [];
  for (const lot of virtualLots) {
    if (remaining.lte(0)) break;
    if (lot.availableRmb.lte(0)) continue;
    const allocated = Decimal.min(remaining, lot.availableRmb);
    rows.push({ lotId: lot.id, allocatedRmb: toDbMoney(allocated) });
    lot.availableRmb = lot.availableRmb.sub(allocated);
    remaining = remaining.sub(allocated);
  }
  return { rows, shortfallRmb: toDbMoney(remaining) };
}

export function buildProfitAuditReport(input: ProfitAuditInput): ProfitAuditReport {
  const activeSales = input.sales
    .filter((sale) => sale.status === "active")
    .sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt) || a.id - b.id);
  const purchaseById = mapById(input.purchases);
  const activeLots = input.lots
    .filter((lot) => purchaseById.get(lot.purchaseId)?.status === "active")
    .sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt) || a.id - b.id);
  const lotById = mapById(activeLots);
  const customerNameById = new Map(input.customers.map((customer) => [customer.id, customer.name]));
  const allocationsBySale = groupBy(input.allocations, (allocation) => allocation.saleId);
  const activeProfitLedgerBySale = groupBy(
    input.ledgerEntries.filter(
      (entry) =>
        entry.entryType === "利潤" &&
        entry.relatedTable === "sales" &&
        entry.relatedId !== null &&
        !entry.isReversal
    ),
    (entry) => entry.relatedId as number
  );
  const reversedLedgerIds = new Set(
    input.ledgerEntries
      .filter((entry) => entry.isReversal && entry.reversesLedgerId !== null)
      .map((entry) => entry.reversesLedgerId as number)
  );
  const issues: ProfitAuditIssue[] = [];
  const affectedSaleIds = new Set<number>();
  let recalculatedSaleProfit = money(0);
  let storedSaleProfit = money(0);

  for (const lot of activeLots) {
    if (money(lot.unitCostTwd).gt(0) && money(lot.unitCostTwd).lt(1)) {
      addIssue(issues, null, customerNameById, {
        kind: "suspicious_lot_cost",
        severity: "error",
        message: `FIFO 批次 #${lot.id} 成本匯率異常偏低`,
        expected: ">= 1.000000",
        actual: lot.unitCostTwd,
        details: { lotId: lot.id, purchaseId: lot.purchaseId }
      });
    }
  }

  const virtualLots = activeLots.map((lot) => ({ ...lot, availableRmb: money(lot.originalRmb) }));

  for (const sale of activeSales) {
    const saleIssuesBefore = issues.length;
    const allocations = allocationsBySale.get(sale.id) ?? [];
    const expectedRevenue = toDbTwd(money(sale.rmbAmount).mul(sale.exchangeRate));
    const allocationRmbTotal = allocations.reduce((sum, row) => sum.add(row.allocatedRmb), money(0));
    const storedAllocationCostTotal = allocations.reduce((sum, row) => sum.add(row.allocatedCostTwd), money(0));
    let recalculatedCost = money(0);

    storedSaleProfit = storedSaleProfit.add(sale.profitTwd);

    if (expectedRevenue !== toDbTwd(sale.twdAmount)) {
      addIssue(issues, sale, customerNameById, {
        kind: "revenue_mismatch",
        severity: "error",
        message: "售出收入與 RMB 金額 x 售出匯率不一致",
        expected: expectedRevenue,
        actual: toDbTwd(sale.twdAmount)
      });
    }

    if (toDbMoney(allocationRmbTotal) !== toDbMoney(sale.rmbAmount)) {
      addIssue(issues, sale, customerNameById, {
        kind: "allocation_rmb_mismatch",
        severity: "error",
        message: "FIFO 分配 RMB 加總不等於售出 RMB",
        expected: toDbMoney(sale.rmbAmount),
        actual: toDbMoney(allocationRmbTotal)
      });
    }

    for (const allocation of allocations) {
      const lot = lotById.get(allocation.lotId);
      if (!lot) {
        addIssue(issues, sale, customerNameById, {
          kind: "missing_lot",
          severity: "error",
          message: `售出分配指向不存在或已非有效買入的 FIFO 批次 #${allocation.lotId}`,
          details: { allocationId: allocation.id, lotId: allocation.lotId }
        });
        recalculatedCost = recalculatedCost.add(allocation.allocatedCostTwd);
        continue;
      }
      const expectedAllocationCost = toDbTwd(money(allocation.allocatedRmb).mul(lot.unitCostTwd));
      recalculatedCost = recalculatedCost.add(expectedAllocationCost);
      if (expectedAllocationCost !== toDbTwd(allocation.allocatedCostTwd)) {
        addIssue(issues, sale, customerNameById, {
          kind: "allocation_cost_mismatch",
          severity: "error",
          message: `FIFO 分配 #${allocation.id} 的批次成本不正確`,
          expected: expectedAllocationCost,
          actual: toDbTwd(allocation.allocatedCostTwd),
          details: { allocationId: allocation.id, lotId: allocation.lotId, unitCostTwd: lot.unitCostTwd }
        });
      }
    }

    const recalculatedCostTwd = toDbTwd(recalculatedCost);
    const recalculatedProfitTwd = toDbTwd(money(expectedRevenue).sub(recalculatedCostTwd));
    recalculatedSaleProfit = recalculatedSaleProfit.add(recalculatedProfitTwd);

    if (!eqMoney(storedAllocationCostTotal, sale.costTwd)) {
      addIssue(issues, sale, customerNameById, {
        kind: "sale_cost_mismatch",
        severity: "error",
        message: "售出成本不等於 FIFO 分配成本加總",
        expected: toDbTwd(storedAllocationCostTotal),
        actual: toDbTwd(sale.costTwd)
      });
    }

    if (recalculatedCostTwd !== toDbTwd(sale.costTwd)) {
      addIssue(issues, sale, customerNameById, {
        kind: "sale_cost_mismatch",
        severity: "error",
        message: "售出成本不等於依批次匯率重新計算的成本",
        expected: recalculatedCostTwd,
        actual: toDbTwd(sale.costTwd)
      });
    }

    if (recalculatedProfitTwd !== toDbTwd(sale.profitTwd)) {
      addIssue(issues, sale, customerNameById, {
        kind: "sale_profit_mismatch",
        severity: "error",
        message: "售出利潤不等於售出收入扣除 FIFO 成本",
        expected: recalculatedProfitTwd,
        actual: toDbTwd(sale.profitTwd)
      });
    }

    const profitRows = activeProfitLedgerBySale.get(sale.id) ?? [];
    const expectedProfit = money(recalculatedProfitTwd);
    if (expectedProfit.gt(0) && profitRows.length === 0) {
      addIssue(issues, sale, customerNameById, {
        kind: "profit_ledger_missing",
        severity: "error",
        message: "正利潤售出缺少對應利潤流水",
        expected: recalculatedProfitTwd,
        actual: "0.00"
      });
    }
    if (profitRows.length > 1) {
      addIssue(issues, sale, customerNameById, {
        kind: "profit_ledger_duplicate",
        severity: "error",
        message: "同一筆售出存在多筆未沖銷利潤流水",
        expected: "1",
        actual: String(profitRows.length)
      });
    }
    const profitLedgerAmount = profitRows.reduce((sum, row) => sum.add(row.amount), money(0));
    if ((expectedProfit.gt(0) || profitLedgerAmount.gt(0)) && toDbTwd(profitLedgerAmount) !== recalculatedProfitTwd) {
      addIssue(issues, sale, customerNameById, {
        kind: "profit_ledger_amount_mismatch",
        severity: "error",
        message: "利潤流水金額不等於重新計算的售出利潤",
        expected: recalculatedProfitTwd,
        actual: toDbTwd(profitLedgerAmount)
      });
    }

    const replay = expectedFifoAllocations(sale, virtualLots);
    if (money(replay.shortfallRmb).gt(0)) {
      addIssue(issues, sale, customerNameById, {
        kind: "fifo_replay_shortfall",
        severity: "error",
        message: "依原始 FIFO 批次重播時庫存不足",
        expected: "0.00",
        actual: replay.shortfallRmb
      });
    }
    const expectedAllocationText = replay.rows.map((row) => `${row.lotId}:${row.allocatedRmb}`).join(",");
    const actualAllocationText = summarizeAllocations(allocations);
    if (expectedAllocationText !== actualAllocationText) {
      addIssue(issues, sale, customerNameById, {
        kind: "fifo_replay_mismatch",
        severity: "error",
        message: "售出分配不符合全公司 FIFO 重播結果",
        expected: expectedAllocationText || "-",
        actual: actualAllocationText || "-"
      });
    }

    if (issues.length > saleIssuesBefore) affectedSaleIds.add(sale.id);
  }

  const openingProfit = input.ledgerEntries
    .filter(
      (entry) =>
        entry.relatedTable === "opening_profit" &&
        entry.direction === "in" &&
        entry.currency === "TWD" &&
        !entry.isReversal &&
        !reversedLedgerIds.has(entry.id)
    )
    .reduce((sum, row) => sum.add(row.amount), money(0));
  const withdrawals = input.ledgerEntries
    .filter(
      (entry) =>
        entry.relatedTable === "profit" &&
        entry.direction === "out" &&
        entry.currency === "TWD" &&
        !entry.isReversal &&
        !reversedLedgerIds.has(entry.id)
    )
    .reduce((sum, row) => sum.add(row.amount), money(0));

  const storedAvailableProfit = storedSaleProfit.add(openingProfit).sub(withdrawals);
  const recalculatedAvailableProfit = recalculatedSaleProfit.add(openingProfit).sub(withdrawals);

  return {
    generatedAt: new Date().toISOString(),
    status: issues.length ? "has_issues" : "ok",
    totals: {
      salesAudited: activeSales.length,
      issueSales: affectedSaleIds.size,
      issues: issues.length,
      storedSaleProfitTwd: toDbTwd(storedSaleProfit),
      recalculatedSaleProfitTwd: toDbTwd(recalculatedSaleProfit),
      saleProfitDeltaTwd: toDbTwd(recalculatedSaleProfit.sub(storedSaleProfit)),
      storedAvailableProfitTwd: toDbTwd(storedAvailableProfit),
      recalculatedAvailableProfitTwd: toDbTwd(recalculatedAvailableProfit),
      availableProfitDeltaTwd: toDbTwd(recalculatedAvailableProfit.sub(storedAvailableProfit)),
      suspiciousLots: issues.filter((issue) => issue.kind === "suspicious_lot_cost").length
    },
    issues
  };
}

export async function runProfitAudit(tx: DbTx) {
  const [saleRows, lotRows, purchaseRows, allocationRows, ledgerRows, customerRows] = await Promise.all([
    tx.select().from(sales),
    tx.select().from(rmbLots),
    tx.select().from(purchases),
    tx.select().from(saleAllocations),
    tx
      .select({
        id: ledgerEntries.id,
        entryType: ledgerEntries.entryType,
        relatedTable: ledgerEntries.relatedTable,
        relatedId: ledgerEntries.relatedId,
        direction: ledgerEntries.direction,
        currency: ledgerEntries.currency,
        amount: ledgerEntries.amount,
        isReversal: ledgerEntries.isReversal,
        reversesLedgerId: ledgerEntries.reversesLedgerId
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.currency, "TWD")
        )
      ),
    tx.select({ id: customers.id, name: customers.name }).from(customers)
  ]);

  return buildProfitAuditReport({
    sales: saleRows,
    lots: lotRows,
    purchases: purchaseRows,
    allocations: allocationRows,
    ledgerEntries: ledgerRows,
    customers: customerRows
  });
}
