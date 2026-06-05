import { describe, expect, it } from "vitest";
import { allocateFifo, calcProfit, calcTwd } from "../../api/_lib/money";

describe("money calculations", () => {
  it("calculates TWD with two decimals", () => {
    expect(calcTwd("3500", "4.5143").toFixed(2)).toBe("15800.05");
  });

  it("allocates FIFO lots and cost", () => {
    const result = allocateFifo([
      { id: 1, remainingRmb: "1000.00", unitCostTwd: "4.40" },
      { id: 2, remainingRmb: "800.00", unitCostTwd: "4.50" }
    ], "1500.00");
    expect(result.allocations).toHaveLength(2);
    expect(result.totalCostTwd).toBe("6650.00");
  });

  it("calculates profit", () => {
    expect(calcProfit("7000.00", "6650.00")).toBe("350.00");
  });

  it("rejects insufficient FIFO inventory by default", () => {
    expect(() => allocateFifo([{ id: 1, remainingRmb: "100.00", unitCostTwd: "4.4" }], "101.00")).toThrow(/insufficient/i);
  });

  it("allows short allocation when enabled", () => {
    const result = allocateFifo([{ id: 1, remainingRmb: "100.00", unitCostTwd: "4.4" }], "150.00", {
      allowShort: true
    });
    expect(result.shortfallRmb).toBe("50.00");
    expect(result.totalCostTwd).toBe("440.00");
  });
});
