import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export function money(value: Decimal.Value) {
  return new Decimal(value || 0);
}

export function toCents(value: Decimal.Value) {
  return money(value).toDecimalPlaces(2);
}

export function toDbMoney(value: Decimal.Value) {
  return toCents(value).toFixed(2);
}

export function toDbRate(value: Decimal.Value) {
  return money(value).toDecimalPlaces(6).toFixed(6);
}

export function calcTwd(rmbAmount: Decimal.Value, exchangeRate: Decimal.Value) {
  return toCents(money(rmbAmount).mul(exchangeRate));
}

export type FifoLotInput = {
  id: number;
  remainingRmb: Decimal.Value;
  unitCostTwd: Decimal.Value;
};

export type FifoAllocation = {
  lotId: number;
  allocatedRmb: string;
  allocatedCostTwd: string;
};

export function allocateFifo(
  lots: FifoLotInput[],
  requestedRmb: Decimal.Value,
  options?: { allowShort?: boolean }
) {
  let remaining = toCents(requestedRmb);
  const allocations: FifoAllocation[] = [];
  let totalCost = money(0);

  for (const lot of lots) {
    if (remaining.lte(0)) break;
    const available = toCents(lot.remainingRmb);
    if (available.lte(0)) continue;

    const allocated = Decimal.min(available, remaining);
    const cost = toCents(allocated.mul(lot.unitCostTwd));

    allocations.push({
      lotId: lot.id,
      allocatedRmb: allocated.toFixed(2),
      allocatedCostTwd: cost.toFixed(2)
    });
    totalCost = totalCost.add(cost);
    remaining = remaining.sub(allocated);
  }

  if (remaining.gt(0) && !options?.allowShort) {
    throw new Error(`RMB inventory is insufficient. Missing ${remaining.toFixed(2)} RMB.`);
  }

  return {
    allocations,
    totalCostTwd: toDbMoney(totalCost),
    shortfallRmb: remaining.gt(0) ? remaining.toFixed(2) : "0.00"
  };
}

export function calcProfit(twdAmount: Decimal.Value, costTwd: Decimal.Value) {
  return toDbMoney(money(twdAmount).sub(costTwd));
}
