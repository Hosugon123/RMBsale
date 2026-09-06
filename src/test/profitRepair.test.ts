import { describe, expect, it } from "vitest";
import { estimateReplacementUnitCost } from "../../api/_lib/profitRepair";

describe("profit FIFO repair", () => {
  it("uses the nearest previous valid lot to repair a suspicious low cost lot", () => {
    const unitCost = estimateReplacementUnitCost(
      { id: 3, createdAt: new Date("2026-07-08T16:57:24.229Z") },
      [
        { id: 1, createdAt: new Date("2026-07-05T10:00:00.000Z"), unitCostTwd: "4.720256" },
        { id: 2, createdAt: new Date("2026-07-07T10:00:00.000Z"), unitCostTwd: "4.700397" },
        { id: 4, createdAt: new Date("2026-07-09T10:00:00.000Z"), unitCostTwd: "4.760000" }
      ]
    );

    expect(unitCost).toBe("4.700397");
  });

  it("falls forward when no previous valid lot exists", () => {
    const unitCost = estimateReplacementUnitCost(
      { id: 1, createdAt: new Date("2026-07-01T10:00:00.000Z") },
      [{ id: 2, createdAt: new Date("2026-07-02T10:00:00.000Z"), unitCostTwd: "4.680000" }]
    );

    expect(unitCost).toBe("4.680000");
  });
});
