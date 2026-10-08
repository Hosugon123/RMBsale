import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export function money(value: Decimal.Value) {
  return new Decimal(value || 0);
}

export function toCents(value: Decimal.Value) {
  return money(value).toDecimalPlaces(2);
}

export function twdMoney(value: Decimal.Value) {
  const amount = money(value);
  const rounded = amount.abs().ceil();
  return amount.isNegative() ? rounded.neg() : rounded;
}

export function toDbMoney(value: Decimal.Value) {
  return toCents(value).toFixed(2);
}

export function toDbTwd(value: Decimal.Value) {
  return twdMoney(value).toFixed(2);
}

export function toDbRate(value: Decimal.Value) {
  return money(value).toDecimalPlaces(6).toFixed(6);
}

export function assertReasonableRmbCostRate(rate: Decimal.Value) {
  if (money(rate).lt(1)) {
    throw new Error("RMB 成本匯率不可低於 1，請檢查是否誤把手續費或備註輸入為匯率");
  }
}

export function calcTwd(rmbAmount: Decimal.Value, exchangeRate: Decimal.Value) {
  return twdMoney(money(rmbAmount).mul(exchangeRate));
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
  const rawAllocations: Array<{ lotId: number; allocatedRmb: Decimal; rawCostTwd: Decimal }> = [];
  let rawTotalCost = money(0);

  for (const lot of lots) {
    if (remaining.lte(0)) break;
    const available = toCents(lot.remainingRmb);
    if (available.lte(0)) continue;

    const allocated = Decimal.min(available, remaining);
    const rawCostTwd = allocated.mul(lot.unitCostTwd);
    rawAllocations.push({ lotId: lot.id, allocatedRmb: allocated, rawCostTwd });
    rawTotalCost = rawTotalCost.add(rawCostTwd);
    remaining = remaining.sub(allocated);
  }

  if (remaining.gt(0) && !options?.allowShort) {
    throw new Error(`RMB inventory is insufficient. Missing ${remaining.toFixed(2)} RMB.`);
  }

  let roundedCumulative = money(0);
  let rawCumulative = money(0);
  const allocations: FifoAllocation[] = rawAllocations.map((item) => {
    rawCumulative = rawCumulative.add(item.rawCostTwd);
    const nextRoundedCumulative = twdMoney(rawCumulative);
    const allocatedCostTwd = nextRoundedCumulative.sub(roundedCumulative);
    roundedCumulative = nextRoundedCumulative;
    return {
      lotId: item.lotId,
      allocatedRmb: item.allocatedRmb.toFixed(2),
      allocatedCostTwd: allocatedCostTwd.toFixed(2)
    };
  });

  return {
    allocations,
    totalCostTwd: toDbTwd(rawTotalCost),
    shortfallRmb: remaining.gt(0) ? remaining.toFixed(2) : "0.00"
  };
}

export function calcProfit(twdAmount: Decimal.Value, costTwd: Decimal.Value) {
  return toDbTwd(money(twdAmount).sub(costTwd));
}
