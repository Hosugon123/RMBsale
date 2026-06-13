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
