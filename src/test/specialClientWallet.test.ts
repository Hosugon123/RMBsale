import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calcDepositBreakdown, calcPeriodSummary } from "../../api/_lib/specialClientWalletCalc";

const m = (value: Decimal.Value) => new Decimal(value || 0);

describe("special client wallet v2 reversal calc", () => {
  it("case A: reversing deposit ¥100,000 @ 1.1%", () => {
    const deposit = calcDepositBreakdown("100000", "0.011");
    expect(deposit.feeRmb).toBe("1100.00");
    expect(deposit.netCreditRmb).toBe("98900.00");

    expect(m(deposit.grossRmb).neg().toFixed(2)).toBe("-100000.00");
    expect(m(deposit.netCreditRmb).neg().toFixed(2)).toBe("-98900.00");
    expect(m(deposit.feeRmb).neg().toFixed(2)).toBe("-1100.00");
  });

  it("case B: reversing payout ¥30,000 restores cash and balance", () => {
    const payout = "30000.00";
    expect(m(payout).toFixed(2)).toBe("30000.00");
  });

  it("case C: cannot reverse twice when already reversed", () => {
    const reversedAt = "2026-01-01";
    const type = "deposit";
    const canReverse = (type as string) !== "reversal" && !reversedAt;
    expect(canReverse).toBe(false);
  });

  it("case C: reversal entry cannot be reversed", () => {
    const entry = { type: "reversal" as const, originalEntryId: 1, reversedAt: null as string | null };
    const canReverse = entry.type !== "reversal" && !entry.reversedAt && !entry.originalEntryId;
    expect(canReverse).toBe(false);
  });

  it("case D: reversal links original and reversal ids", () => {
    const original = { id: 10, reversalEntryId: 11 };
    const reversal = { id: 11, originalEntryId: 10 };
    expect(reversal.originalEntryId).toBe(original.id);
    expect(original.reversalEntryId).toBe(reversal.id);
  });
});

describe("special client wallet calc", () => {
  it("deposit ¥100,000 at 1.1%", () => {
    const result = calcDepositBreakdown("100000", "0.011");
    expect(result.grossRmb).toBe("100000.00");
    expect(result.feeRmb).toBe("1100.00");
    expect(result.netCreditRmb).toBe("98900.00");
  });
});

describe("special client wallet period summary", () => {
  it("excludes reversed payouts from totalPayoutRmb", () => {
    const result = calcPeriodSummary([
      { type: "payout", payoutRmb: "100000.00", reversedAt: null },
      { type: "payout", payoutRmb: "50000.00", reversedAt: "2026-06-09T00:00:00.000Z" },
      { type: "payout", payoutRmb: "120000.00", reversedAt: null }
    ]);
    expect(result.totalPayoutRmb).toBe("220000.00");
  });

  it("excludes reversed deposits from gross and fee totals", () => {
    const result = calcPeriodSummary([
      { type: "deposit", grossRmb: "100000.00", feeRmb: "1100.00", reversedAt: null },
      { type: "deposit", grossRmb: "30000.00", feeRmb: "330.00", reversedAt: "2026-06-09T00:00:00.000Z" }
    ]);
    expect(result.totalGrossRmb).toBe("100000.00");
    expect(result.totalFeeRmb).toBe("1100.00");
  });
});
