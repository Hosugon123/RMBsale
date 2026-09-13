import { describe, expect, it } from "vitest";
import { buildProfitAuditReport, type ProfitAuditInput } from "../../api/_lib/profitAudit";

const baseInput = (): ProfitAuditInput => ({
  customers: [{ id: 1, name: "稽核客戶" }],
  purchases: [
    { id: 1, status: "active" },
    { id: 2, status: "active" }
  ],
  lots: [
    { id: 1, purchaseId: 1, originalRmb: "1000.00", unitCostTwd: "4.500000", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: 2, purchaseId: 2, originalRmb: "1000.00", unitCostTwd: "4.600000", createdAt: "2026-01-02T00:00:00.000Z" }
  ],
  sales: [
    {
      id: 1,
      customerId: 1,
      rmbAmount: "1500.00",
      exchangeRate: "4.800000",
      twdAmount: "7200.00",
      costTwd: "6800.00",
      profitTwd: "400.00",
      status: "active",
      createdAt: "2026-01-03T00:00:00.000Z"
    }
  ],
  allocations: [
    { id: 1, saleId: 1, lotId: 1, allocatedRmb: "1000.00", allocatedCostTwd: "4500.00" },
    { id: 2, saleId: 1, lotId: 2, allocatedRmb: "500.00", allocatedCostTwd: "2300.00" }
  ],
  ledgerEntries: [
    {
      id: 1,
      entryType: "利潤",
      relatedTable: "sales",
      relatedId: 1,
      direction: "in",
      currency: "TWD",
      amount: "400.00",
      isReversal: false,
      reversesLedgerId: null
    }
  ]
});

describe("profit audit", () => {
  it("passes when sale profit, FIFO allocation, and profit ledger are consistent", () => {
    const report = buildProfitAuditReport(baseInput());

    expect(report.status).toBe("ok");
    expect(report.totals.salesAudited).toBe(1);
    expect(report.totals.issues).toBe(0);
    expect(report.totals.recalculatedSaleProfitTwd).toBe("400.00");
    expect(report.totals.recalculatedAvailableProfitTwd).toBe("400.00");
  });

  it("flags incorrect sale profit and missing profit ledger", () => {
    const input = baseInput();
    input.sales[0].profitTwd = "500.00";
    input.ledgerEntries = [];

    const report = buildProfitAuditReport(input);

    expect(report.status).toBe("has_issues");
    expect(report.issues.map((issue) => issue.kind)).toEqual(
      expect.arrayContaining(["sale_profit_mismatch", "profit_ledger_missing"])
    );
    expect(report.totals.storedSaleProfitTwd).toBe("500.00");
    expect(report.totals.recalculatedSaleProfitTwd).toBe("400.00");
    expect(report.totals.saleProfitDeltaTwd).toBe("-100.00");
  });

  it("flags allocations that do not match company-wide FIFO replay", () => {
    const input = baseInput();
    input.allocations = [
      { id: 1, saleId: 1, lotId: 2, allocatedRmb: "1500.00", allocatedCostTwd: "6900.00" }
    ];
    input.sales[0].costTwd = "6900.00";
    input.sales[0].profitTwd = "300.00";
    input.ledgerEntries[0].amount = "300.00";

    const report = buildProfitAuditReport(input);

    expect(report.status).toBe("has_issues");
    expect(report.issues.map((issue) => issue.kind)).toContain("fifo_replay_mismatch");
  });
});
