import { d } from "./utils";

export function calcDepositBreakdown(grossRmb: string, feeRate: string) {
  const gross = d(grossRmb);
  const rate = d(feeRate);
  if (gross.lte(0)) throw new Error("結匯 RMB 金額必須大於 0");
  if (rate.lt(0)) throw new Error("服務費率不可小於 0");
  const fee = gross.mul(rate);
  const net = gross.sub(fee);
  return {
    grossRmb: gross.toDecimalPlaces(2).toFixed(2),
    feeRmb: fee.toDecimalPlaces(2).toFixed(2),
    netCreditRmb: net.toDecimalPlaces(2).toFixed(2),
    feeRate: rate.toDecimalPlaces(6).toFixed(6)
  };
}

export function formatFeeRatePercent(feeRate: string) {
  return `${d(feeRate).mul(100).toDecimalPlaces(2).toNumber()}%`;
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
  let totalGrossRmb = d(0);
  let totalPayoutRmb = d(0);
  let totalFeeRmb = d(0);

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

export function entryTypeLabel(type: string, reversedAt?: Date | string | null) {
  if (type === "reversal") return "沖銷紀錄";
  if (reversedAt) return "已沖銷";
  if (type === "deposit") return "儲值";
  if (type === "payout") return "代付";
  return type;
}

export function reversalStatusLabel(type: string, reversedAt?: Date | string | null, reverseReason?: string | null) {
  if (type === "reversal") return "沖銷紀錄";
  if (reversedAt) return "已沖銷";
  return "正常";
}

export function profitLedgerStatusLabel(
  type: string,
  profitLedgerId?: number | null,
  reversedAt?: Date | string | null
) {
  if (type === "reversal") return "已沖銷利潤";
  if (type === "deposit" && reversedAt) return "已沖銷";
  if (type === "deposit" && profitLedgerId) return "已入帳";
  if (type === "deposit") return "—";
  return "不適用";
}
