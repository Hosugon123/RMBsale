import Decimal from "decimal.js";
import type { AppState } from "../types";
import { d } from "../utils";
import { CUSTOMER_SHEETS, type AssetFlowRow, type CustomerSheetStats } from "./parse";

export type ValidationCheck = {
  customer: string;
  field: string;
  status: "OK" | "WARN";
  expected: string;
  actual: string;
  note?: string;
};

const COUNT_TOLERANCE = 3;
const MONEY_TOLERANCE = new Decimal(1);

export function flowStatsByCustomer(rows: AssetFlowRow[]) {
  const map = new Map<
    string,
    { sales: number; saleTwd: Decimal; settlements: Decimal }
  >();
  for (const row of rows) {
    const name = row.party?.trim();
    if (!name) continue;
    if (!map.has(name)) map.set(name, { sales: 0, saleTwd: new Decimal(0), settlements: new Decimal(0) });
    const item = map.get(name)!;
    if (row.category === "售出") {
      item.sales++;
      if (row.receivableTwd) item.saleTwd = item.saleTwd.add(row.receivableTwd);
      else if (row.rmb && row.rate) item.saleTwd = item.saleTwd.add(d(row.rmb).mul(row.rate));
    }
    if (row.category === "收帳" && row.settlementOrTransferTwd) {
      item.settlements = item.settlements.add(row.settlementOrTransferTwd);
    }
  }
  return map;
}

export function crossValidateCustomers(
  state: AppState,
  flowRows: AssetFlowRow[],
  sheetStats: CustomerSheetStats[]
): ValidationCheck[] {
  const flowByCustomer = flowStatsByCustomer(flowRows);
  const checks: ValidationCheck[] = [];

  for (const stats of sheetStats) {
    const customer = stats.sheetName;
    const exists = state.customers.some((c) => c.name === customer);
    checks.push({
      customer,
      field: "客戶存在",
      status: exists ? "OK" : "WARN",
      expected: "已建立",
      actual: exists ? "是" : "否",
      note: exists ? undefined : "流向表未出現此客戶交易"
    });

    const flow = flowByCustomer.get(customer) ?? { sales: 0, saleTwd: new Decimal(0), settlements: new Decimal(0) };
    const saleCountDiff = Math.abs(flow.sales - stats.saleCount);
    checks.push({
      customer,
      field: "售出筆數",
      status: saleCountDiff <= COUNT_TOLERANCE ? "OK" : "WARN",
      expected: String(stats.saleCount),
      actual: String(flow.sales),
      note: saleCountDiff > COUNT_TOLERANCE ? `差異 ${saleCountDiff} 筆` : undefined
    });

    const sheetSaleTwd = new Decimal(stats.saleReceivableSum);
    const saleTwdDiff = sheetSaleTwd.sub(flow.saleTwd).abs();
    checks.push({
      customer,
      field: "售出應收合計",
      status: saleTwdDiff.lte(MONEY_TOLERANCE) ? "OK" : "WARN",
      expected: stats.saleReceivableSum,
      actual: flow.saleTwd.toFixed(2),
      note: saleTwdDiff.gt(MONEY_TOLERANCE) ? `差額 ${saleTwdDiff.toFixed(2)}` : undefined
    });

    const settlementDiff = new Decimal(stats.settlementSum).sub(flow.settlements).abs();
    checks.push({
      customer,
      field: "收帳合計",
      status: settlementDiff.lte(MONEY_TOLERANCE) ? "OK" : "WARN",
      expected: stats.settlementSum,
      actual: flow.settlements.toFixed(2),
      note: settlementDiff.gt(MONEY_TOLERANCE) ? `差額 ${settlementDiff.toFixed(2)}` : undefined
    });

    if (stats.lastDebt != null) {
      const actual = state.customers.find((c) => c.name === customer)?.receivableTwd ?? "0.00";
      const debtDiff = d(stats.lastDebt).sub(actual).abs();
      checks.push({
        customer,
        field: "期末欠款",
        status: debtDiff.lte(MONEY_TOLERANCE) ? "OK" : "WARN",
        expected: stats.lastDebt,
        actual,
        note: debtDiff.gt(MONEY_TOLERANCE) ? `差額 ${debtDiff.toFixed(2)}` : undefined
      });
    }
  }

  for (const name of CUSTOMER_SHEETS) {
    if (!sheetStats.some((s) => s.sheetName === name)) {
      checks.push({
        customer: name,
        field: "草表",
        status: "WARN",
        expected: "有工作表",
        actual: "缺少",
        note: "找不到客戶草表"
      });
    }
  }

  return checks;
}
