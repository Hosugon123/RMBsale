import { money, toDbMoney, toDbRate } from "./money.js";

export function calcDepositBreakdown(grossRmb: string, feeRate: string) {
  const gross = money(grossRmb);
  const rate = money(feeRate);
  if (gross.lte(0)) throw new Error("結匯 RMB 金額必須大於 0");
  if (rate.lt(0)) throw new Error("服務費率不可小於 0");
  const fee = gross.mul(rate);
  const net = gross.sub(fee);
  return {
    grossRmb: toDbMoney(gross),
    feeRmb: toDbMoney(fee),
    netCreditRmb: toDbMoney(net),
    feeRate: toDbRate(rate)
  };
}

export function formatFeeRatePercent(feeRate: string) {
  return `${money(feeRate).mul(100).toDecimalPlaces(2).toNumber()}%`;
}

type PeriodSummaryEntry = {
  type: "deposit" | "payout" | "reversal";
  grossRmb?: string | null;
  feeRmb?: string | null;
  payoutRmb?: string | null;
  reversedAt?: Date | string | null;
};

/** 區間累計：已沖銷的原始 deposit/payout 不計入；reversal 列僅供對帳顯示，不重複扣減。 */
export function calcPeriodSummary(entries: PeriodSummaryEntry[]) {
  let totalGrossRmb = money(0);
  let totalPayoutRmb = money(0);
  let totalFeeRmb = money(0);

  for (const row of entries) {
    if (row.type === "deposit" && !row.reversedAt) {
      totalGrossRmb = totalGrossRmb.add(row.grossRmb ?? 0);
      totalFeeRmb = totalFeeRmb.add(row.feeRmb ?? 0);
    } else if (row.type === "payout" && !row.reversedAt) {
      totalPayoutRmb = totalPayoutRmb.add(row.payoutRmb ?? 0);
    }
  }

  return {
    totalGrossRmb: totalGrossRmb.toFixed(2),
    totalPayoutRmb: totalPayoutRmb.toFixed(2),
    totalFeeRmb: totalFeeRmb.toFixed(2)
  };
}
