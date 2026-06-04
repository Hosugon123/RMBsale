import { describe, expect, it } from "vitest";
import {
  accountCurrency,
  findAssetFlowHeaderIndex,
  holderKeyFromAccount,
  isFlowCategory,
  parseAssetFlowRows,
  parseExcelDate,
  parseRmbHoldingBalances,
  parseTwdHoldingBalances
} from "../lib/xlsxImport/parse";

describe("xlsxImport parse", () => {
  it("parses slash dates in Taipei offset", () => {
    expect(parseExcelDate("2026/02/26")).toBe("2026-02-26T00:00:00.000Z");
  });

  it("detects asset flow header and categories", () => {
    const rows: unknown[][] = [
      ["日期", " 類別", "x"],
      ["持有台", "6186台"],
      ["日期", "類別", "對象/客戶", "草", "匯率", "應收", "收帳", "台", "出帳戶", "入帳戶", "備註"],
      ["2026/02/26", "售出", "柏草", 100, 4.7, 470, null, null, "0107草", null, null],
      ["2026/03/03", "買入", null, 1000, 4.5, null, null, 4500, "7773台", "0107草", null]
    ];
    expect(findAssetFlowHeaderIndex(rows)).toBe(2);
    const parsed = parseAssetFlowRows(rows);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].category).toBe("買入");
    expect(parsed[1].category).toBe("售出");
    expect(isFlowCategory("售出")).toBe(true);
  });

  it("parses 持有台 balances above threshold", () => {
    const rows: unknown[][] = [
      ["持有台", "6186台", "0107台", "7773台"],
      [1514817, 14, 564484.71, 689553.9]
    ];
    expect(parseTwdHoldingBalances(rows)).toEqual({
      "0107台": "564484.71",
      "7773台": "689553.90"
    });
  });

  it("parses 持有草 positive balances", () => {
    const rows: unknown[][] = [
      ["持有草", "6186草", "0107草", "7773草"],
      [-1, 2451, -107357, 293]
    ];
    expect(parseRmbHoldingBalances(rows)).toEqual({ "6186草": "2451.00", "7773草": "293.00" });
  });

  it("maps account currency and holder key", () => {
    expect(accountCurrency("0107草")).toBe("RMB");
    expect(accountCurrency("7773台")).toBe("TWD");
    expect(holderKeyFromAccount("0107草")).toBe("0107");
  });
});
