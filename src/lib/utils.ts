import { type ClassValue, clsx } from "clsx";
import Decimal from "decimal.js";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function d(value: Decimal.Value) {
  return new Decimal(value || 0);
}

/** 解析表單金額字串；空字串或無效格式回傳 null，避免 Decimal 拋錯導致畫面崩潰。 */
export function parseMoneyInput(input: string): Decimal | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const value = new Decimal(trimmed);
    return value.isFinite() ? value : null;
  } catch {
    return null;
  }
}

export function defaultSettlementAmount(receivableTwd: string) {
  return Number(receivableTwd) > 0 ? receivableTwd : "";
}

export function fmtMoney(value: Decimal.Value, currency: "TWD" | "RMB" = "TWD") {
  const prefix = currency === "TWD" ? "NT$" : "¥";
  return `${prefix} ${d(value).toNumber().toLocaleString("zh-TW", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function fmtDirectionalMoney(value: Decimal.Value, currency: "TWD" | "RMB" = "TWD", direction?: "in" | "out" | "none") {
  const sign = direction === "out" ? "-" : direction === "in" ? "+" : "";
  return `${sign}${fmtMoney(value, currency)}`;
}

export function fmtRate(value: Decimal.Value) {
  return d(value).toDecimalPlaces(4).toFixed(4);
}

export function todayText() {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).format(new Date());
}

export function nextId(items: { id: number }[]) {
  return items.length ? Math.max(...items.map((item) => item.id)) + 1 : 1;
}
