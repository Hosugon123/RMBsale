import { and, eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { writeAudit, type AuditActor } from "./audit.js";
import type { DbTx } from "./db.js";
import { money, toDbRate, toDbTwd } from "./money.js";
import { customers, ledgerEntries, purchases, rmbLots, saleAllocations, sales } from "./schema.js";

const DEFAULT_SUSPICIOUS_UNIT_COST_THRESHOLD = "1";
const PROFIT_REPAIR_ACTION = "REPAIR_PROFIT_FIFO_COSTS";

type RepairMode = "dryRun" | "apply";

type ProfitRepairOptions = {
  mode?: RepairMode;
  suspiciousUnitCostThreshold?: string;
};

type LotRow = typeof rmbLots.$inferSelect;
type PurchaseRow = typeof purchases.$inferSelect;
type SaleRow = typeof sales.$inferSelect;
type AllocationRow = typeof saleAllocations.$inferSelect;

export type ProfitRepairReport = {
  mode: RepairMode;
  suspiciousUnitCostThreshold: string;
  suspiciousLots: Array<{
    lotId: number;
    purchaseId: number;
    originalUnitCostTwd: string;
    repairedUnitCostTwd: string;
    originalRmb: string;
    remainingRmb: string;
  }>;
  impactedSales: Array<{
    saleId: number;
    originalCostTwd: string;
    repairedCostTwd: string;
    originalProfitTwd: string;
    repairedProfitTwd: string;
    profitDeltaTwd: string;
  }>;
  totals: {
    suspiciousLots: number;
    impactedSales: number;
    costIncreaseTwd: string;
    profitDeltaTwd: string;
  };
};

function byCreatedAtThenId<T extends { createdAt: Date; id: number }>(a: T, b: T) {
  return a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id;
}

function isSuspiciousLot(lot: LotRow, threshold: Decimal) {
  return money(lot.originalRmb).gt(0) && money(lot.unitCostTwd).gt(0) && money(lot.unitCostTwd).lt(threshold);
}

export function estimateReplacementUnitCost(
  lot: Pick<LotRow, "id" | "createdAt">,
  candidateLots: Array<Pick<LotRow, "id" | "createdAt" | "unitCostTwd">>
) {
  const sorted = [...candidateLots].sort(byCreatedAtThenId);
  const before = sorted
    .filter((candidate) => candidate.id !== lot.id && candidate.createdAt.getTime() <= lot.createdAt.getTime())
    .at(-1);
  if (before) return toDbRate(before.unitCostTwd);

  const after = sorted.find((candidate) => candidate.id !== lot.id && candidate.createdAt.getTime() > lot.createdAt.getTime());
  return toDbRate(after?.unitCostTwd ?? "4.750000");
}

async function syncProfitLedger(
  tx: DbTx,
  sale: SaleRow,
  customerName: string,
  repairedProfitTwd: string,
  actorId: number
) {
  const [existing] = await tx
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.entryType, "利潤"),
        eq(ledgerEntries.relatedTable, "sales"),
        eq(ledgerEntries.relatedId, sale.id),
        eq(ledgerEntries.isReversal, false)
      )
    )
    .limit(1);

  if (money(repairedProfitTwd).lte(0)) {
    if (existing) await tx.delete(ledgerEntries).where(eq(ledgerEntries.id, existing.id));
    return;
  }

  const values = {
    customerId: sale.customerId,
    amount: toDbTwd(repairedProfitTwd),
    description: `${customerName} 售出利潤`,
    operatorId: actorId,
    createdAt: sale.createdAt
  };

  if (existing) {
    await tx.update(ledgerEntries).set(values).where(eq(ledgerEntries.id, existing.id));
    return;
  }

  await tx.insert(ledgerEntries).values({
    entryType: "利潤",
    relatedTable: "sales",
    relatedId: sale.id,
    direction: "in",
    currency: "TWD",
    ...values
  });
}

export async function repairProfitFifoCosts(
  tx: DbTx,
  options: ProfitRepairOptions,
  actor: AuditActor
): Promise<ProfitRepairReport> {
  const mode: RepairMode = options.mode === "apply" ? "apply" : "dryRun";
  const threshold = money(options.suspiciousUnitCostThreshold ?? DEFAULT_SUSPICIOUS_UNIT_COST_THRESHOLD);
  const thresholdText = toDbRate(threshold);

  const [purchaseRows, lotRows, saleRows, allocationRows, customerRows] = await Promise.all([
    tx.select().from(purchases),
    tx.select().from(rmbLots),
    tx.select().from(sales),
    tx.select().from(saleAllocations),
    tx.select().from(customers)
  ]);

  const activePurchaseIds = new Set(purchaseRows.filter((row) => row.status === "active").map((row) => row.id));
  const activeLots = lotRows.filter((row) => activePurchaseIds.has(row.purchaseId));
  const suspiciousLots = activeLots.filter((row) => isSuspiciousLot(row, threshold));
  const suspiciousLotIds = new Set(suspiciousLots.map((row) => row.id));
  const validLots = activeLots.filter((row) => !suspiciousLotIds.has(row.id) && money(row.unitCostTwd).gte(threshold));
  const replacementByLot = new Map(
    suspiciousLots.map((lot) => [lot.id, estimateReplacementUnitCost(lot, validLots)])
  );

  const saleById = new Map(saleRows.filter((row) => row.status === "active").map((row) => [row.id, row]));
  const customerNameById = new Map(customerRows.map((row) => [row.id, row.name]));
  const allocationsBySale = new Map<number, AllocationRow[]>();
  for (const allocation of allocationRows) {
    if (!allocationsBySale.has(allocation.saleId)) allocationsBySale.set(allocation.saleId, []);
    allocationsBySale.get(allocation.saleId)!.push(allocation);
  }

  const changedAllocations = allocationRows
    .filter((allocation) => suspiciousLotIds.has(allocation.lotId) && saleById.has(allocation.saleId))
    .map((allocation) => {
      const repairedUnitCost = replacementByLot.get(allocation.lotId) ?? "4.750000";
      const repairedCostTwd = toDbTwd(money(allocation.allocatedRmb).mul(repairedUnitCost));
      return { allocation, repairedUnitCost, repairedCostTwd };
    })
    .filter((item) => toDbTwd(item.allocation.allocatedCostTwd) !== item.repairedCostTwd);

  const impactedSaleIds = [...new Set(changedAllocations.map((item) => item.allocation.saleId))];
  const impactedSales: ProfitRepairReport["impactedSales"] = [];
  let costIncrease = money(0);
  let profitDelta = money(0);

  for (const saleId of impactedSaleIds) {
    const sale = saleById.get(saleId);
    const allocations = allocationsBySale.get(saleId) ?? [];
    if (!sale) continue;

    let repairedCost = money(0);
    for (const allocation of allocations) {
      const replacement = changedAllocations.find((item) => item.allocation.id === allocation.id);
      repairedCost = repairedCost.add(replacement?.repairedCostTwd ?? allocation.allocatedCostTwd);
    }

    const repairedCostTwd = toDbTwd(repairedCost);
    const repairedProfitTwd = toDbTwd(money(sale.twdAmount).sub(repairedCostTwd));
    const saleCostIncrease = money(repairedCostTwd).sub(sale.costTwd);
    const saleProfitDelta = money(repairedProfitTwd).sub(sale.profitTwd);
    costIncrease = costIncrease.add(saleCostIncrease);
    profitDelta = profitDelta.add(saleProfitDelta);

    impactedSales.push({
      saleId,
      originalCostTwd: toDbTwd(sale.costTwd),
      repairedCostTwd,
      originalProfitTwd: toDbTwd(sale.profitTwd),
      repairedProfitTwd,
      profitDeltaTwd: toDbTwd(saleProfitDelta)
    });
  }

  const report: ProfitRepairReport = {
    mode,
    suspiciousUnitCostThreshold: thresholdText,
    suspiciousLots: suspiciousLots.sort(byCreatedAtThenId).map((lot) => ({
      lotId: lot.id,
      purchaseId: lot.purchaseId,
      originalUnitCostTwd: toDbRate(lot.unitCostTwd),
      repairedUnitCostTwd: replacementByLot.get(lot.id) ?? "4.750000",
      originalRmb: lot.originalRmb,
      remainingRmb: lot.remainingRmb
    })),
    impactedSales,
    totals: {
      suspiciousLots: suspiciousLots.length,
      impactedSales: impactedSales.length,
      costIncreaseTwd: toDbTwd(costIncrease),
      profitDeltaTwd: toDbTwd(profitDelta)
    }
  };

  if (mode === "dryRun" || changedAllocations.length === 0) return report;

  for (const lot of suspiciousLots) {
    const repairedUnitCost = replacementByLot.get(lot.id) ?? "4.750000";
    await tx
      .update(rmbLots)
      .set({ unitCostTwd: repairedUnitCost, exchangeRate: repairedUnitCost })
      .where(eq(rmbLots.id, lot.id));
  }

  for (const item of changedAllocations) {
    await tx
      .update(saleAllocations)
      .set({ allocatedCostTwd: item.repairedCostTwd })
      .where(eq(saleAllocations.id, item.allocation.id));
  }

  for (const saleReport of impactedSales) {
    const sale = saleById.get(saleReport.saleId);
    if (!sale) continue;
    await tx
      .update(sales)
      .set({ costTwd: saleReport.repairedCostTwd, profitTwd: saleReport.repairedProfitTwd })
      .where(eq(sales.id, saleReport.saleId));
    await syncProfitLedger(
      tx,
      sale,
      customerNameById.get(sale.customerId) ?? "客戶",
      saleReport.repairedProfitTwd,
      actor.id ?? sale.operatorId
    );
  }

  await writeAudit(tx, {
    action: PROFIT_REPAIR_ACTION,
    targetType: "profit_fifo_costs",
    after: report,
    actor
  });

  return report;
}
