import Decimal from "decimal.js";
import type { Currency } from "../types";

export const CUSTOMER_SHEETS = ["柏草", "胡草", "芸草", "吳草", "蕭草"] as const;
export const FLOW_CATEGORIES = ["買入", "售出", "收帳", "內轉", "增資"] as const;
export type FlowCategory = (typeof FLOW_CATEGORIES)[number];

const CATEGORY_ORDER: Record<FlowCategory, number> = {
  買入: 0,
  售出: 1,
  收帳: 2,
  內轉: 3,
  增資: 4
};

export type AssetFlowRow = {
  sheetRow: number;
  date: string;
  category: FlowCategory;
  party: string | null;
  rmb: string | null;
  rate: string | null;
  receivableTwd: string | null;
  settlementOrTransferTwd: string | null;
  twd: string | null;
  outAccount: string | null;
  inAccount: string | null;
  note: string | null;
};

function parseHoldingBalances(
  sheetRows: unknown[][],
  rowLabel: string,
  accountSuffix: string,
  minAmount = 0
): Record<string, string> {
  let labelRow = -1;
  for (let i = 0; i < Math.min(30, sheetRows.length); i++) {
    if (String(sheetRows[i]?.[0] ?? "").trim() === rowLabel) {
      labelRow = i;
      break;
    }
  }
  if (labelRow < 0) return {};

  const labels = sheetRows[labelRow];
  const values = sheetRows[labelRow + 1];
  const balances: Record<string, string> = {};
  for (let c = 1; c < (labels?.length ?? 0); c++) {
    const label = String(labels[c] ?? "").trim();
    if (!label.endsWith(accountSuffix)) continue;
    const raw = values?.[c];
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n) || n <= minAmount) continue;
    balances[label] = new Decimal(n).toDecimalPlaces(2).toFixed(2);
  }
  return balances;
}

/** 讀取資產流向表頂部「持有草」列（帳戶名 → 正數餘額）。 */
export function parseRmbHoldingBalances(sheetRows: unknown[][]): Record<string, string> {
  return parseHoldingBalances(sheetRows, "持有草", "草");
}

/** 讀取資產流向表頂部「持有台」列；略過小於 1000 的數值（避免誤讀 6186台=14 等欄位）。 */
export function parseTwdHoldingBalances(sheetRows: unknown[][]): Record<string, string> {
  return parseHoldingBalances(sheetRows, "持有台", "台", 1000);
}

export type SheetHoldings = {
  rmb: Record<string, string>;
  twd: Record<string, string>;
};

export function parseSheetHoldings(sheetRows: unknown[][]): SheetHoldings {
  return {
    rmb: parseRmbHoldingBalances(sheetRows),
    twd: parseTwdHoldingBalances(sheetRows)
  };
}

export function findAssetFlowHeaderIndex(rows: unknown[][]): number {
  let last = -1;
  for (let i = 0; i < rows.length; i++) {
    const a = String(rows[i]?.[0] ?? "").trim();
    const b = String(rows[i]?.[1] ?? "").trim();
    if (a.includes("日期") && b === "類別") last = i;
  }
  return last;
}

export function parseExcelDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  if (!text) return null;
  const slash = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slash) {
    const [, y, m, d] = slash;
    return new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T08:00:00+08:00`).toISOString();
  }
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return null;
}

export function parseMoney(value: unknown): string | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return new Decimal(n).toDecimalPlaces(2).toFixed(2);
}

export function parseRate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value));
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Decimal(n).toDecimalPlaces(6).toFixed(6);
}

function trimCell(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

export function isFlowCategory(value: string): value is FlowCategory {
  return (FLOW_CATEGORIES as readonly string[]).includes(value);
}

export function parseAssetFlowRows(rows: unknown[][]): AssetFlowRow[] {
  const headerIndex = findAssetFlowHeaderIndex(rows);
  if (headerIndex < 0) throw new Error("資產流向表找不到表頭列");

  const parsed: AssetFlowRow[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.[0]) continue;
    const category = trimCell(row[1]);
    if (!category || !isFlowCategory(category)) continue;

    const date = parseExcelDate(row[0]);
    if (!date) continue;

    parsed.push({
      sheetRow: i + 1,
      date,
      category,
      party: trimCell(row[2]),
      rmb: parseMoney(row[3]),
      rate: parseRate(row[4]),
      receivableTwd: parseMoney(row[5]),
      settlementOrTransferTwd: parseMoney(row[6]),
      twd: parseMoney(row[7]),
      outAccount: trimCell(row[8]),
      inAccount: trimCell(row[9]),
      note: trimCell(row[10])
    });
  }

  // 先全部買入建庫存，再依日期重播其餘類別（符合 IMPORT_PLAN，避免售出早於買入）
  return parsed.sort((a, b) => {
    const byType = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    if (byType !== 0) return byType;
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return a.sheetRow - b.sheetRow;
  });
}

export function accountCurrency(name: string): Currency | null {
  if (name.endsWith("草")) return "RMB";
  if (name.endsWith("台")) return "TWD";
  return null;
}

export function holderKeyFromAccount(name: string): string {
  const match = name.match(/^(\d+)/);
  return match?.[1] ?? name;
}

export function collectAccountNames(rows: AssetFlowRow[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    if (row.outAccount && row.outAccount !== "出帳戶") names.add(row.outAccount);
    if (row.inAccount && row.inAccount !== "入帳戶") names.add(row.inAccount);
  }
  return [...names].sort();
}

export type CustomerSheetStats = {
  sheetName: string;
  saleCount: number;
  saleReceivableSum: string;
  settlementSum: string;
  lastDebt: string | null;
};

export function parseCustomerSheetStats(sheetName: string, rows: unknown[][]): CustomerSheetStats {
  let saleCount = 0;
  let saleReceivableSum = new Decimal(0);
  let settlementSum = new Decimal(0);
  let lastDebt: string | null = null;

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.[0]) continue;
    const rmb = row[1];
    const rate = row[2];
    const receivable = row[4];
    const settlement = row[6];
    const debt = row[7];

    if (debt != null && debt !== "") {
      const parsed = parseMoney(debt);
      if (parsed) lastDebt = parsed;
    }

    if (rmb != null && Number(rmb) > 0) {
      saleCount++;
      if (receivable != null && receivable !== "") {
        const r = parseMoney(receivable);
        if (r) saleReceivableSum = saleReceivableSum.add(r);
      } else if (rate != null) {
        saleReceivableSum = saleReceivableSum.add(new Decimal(Number(rmb)).mul(Number(rate)));
      }
    }

    if (settlement != null && Number(settlement) > 0) {
      const s = parseMoney(settlement);
      if (s) settlementSum = settlementSum.add(s);
    }
  }

  return {
    sheetName,
    saleCount,
    saleReceivableSum: saleReceivableSum.toDecimalPlaces(2).toFixed(2),
    settlementSum: settlementSum.toDecimalPlaces(2).toFixed(2),
    lastDebt
  };
}
