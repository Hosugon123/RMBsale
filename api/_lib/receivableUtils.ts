import { money } from "./money.js";

export function resolveCustomerSettlementStatus(
  receivableTwd: string | number,
  activeSaleTwdAmounts: Array<string | number>
): "unsettled" | "partial" | "settled" {
  const receivable = money(receivableTwd);
  if (receivable.lte(0)) return "settled";
  if (activeSaleTwdAmounts.length === 0) return "partial";
  const totalSaleTwd = activeSaleTwdAmounts.reduce(
    (sum, amount) => sum.add(money(amount)),
    money(0)
  );
  return receivable.gte(totalSaleTwd) ? "unsettled" : "partial";
}
