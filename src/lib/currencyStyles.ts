/**
 * 系統幣別色（對應 tailwind.config.ts）：
 * - twd 台幣藍 #2563eb
 * - rmb 人民幣綠 #15803d
 * - receivable 應收紅 #dc2626
 * - pending 利潤黃 #d97706
 */

export const twd = {
  text: "text-twd",
  money: "font-semibold text-twd",
  moneyCell: "text-right font-semibold text-twd",
  surface: "rounded-md border border-twd/20 bg-twd/10 p-3",
  surfaceLabel: "text-xs text-twd/80",
  surfaceValue: "mt-1 text-2xl font-semibold text-twd",
  badge: "bg-twd/15 text-twd",
  icon: "bg-twd/15 text-twd"
} as const;

/** 人民幣綠 #15803d — 人民幣金額、RMB 摘要區塊 */
export const rmb = {
  text: "text-rmb",
  money: "font-semibold text-rmb",
  moneyCell: "text-right font-semibold text-rmb",
  surface: "rounded-md border border-rmb/20 bg-rmb/10 p-3",
  surfaceLabel: "text-xs text-rmb/80",
  surfaceValue: "mt-1 text-2xl font-semibold text-rmb",
  badge: "bg-rmb/15 text-rmb",
  icon: "bg-rmb/15 text-rmb"
} as const;

export const receivable = {
  text: "text-receivable",
  money: "font-semibold text-receivable",
  moneyCell: "text-right font-semibold text-receivable",
  surface: "rounded-md border border-receivable/20 bg-receivable/10 p-3",
  surfaceLabel: "text-xs text-receivable/80",
  surfaceValue: "mt-1 text-2xl font-semibold text-receivable"
} as const;

export const profit = {
  text: "text-pending",
  money: "font-semibold text-pending",
  moneyCell: "text-right font-semibold text-pending",
  badge: "bg-pending/15 text-pending",
  icon: "bg-pending/15 text-pending"
} as const;
