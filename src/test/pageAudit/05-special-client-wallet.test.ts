import { describe, expect, it } from "vitest";
import { calcDepositBreakdown, calcPeriodSummary } from "../../../api/_lib/specialClientWalletCalc";
import { createSeedState, totals } from "../../lib/localStore";

/** Part 5／8：儲值代付 — 儲值計算、區間統計、儀表板利潤 */
describe("page audit 5/8 儲值代付", () => {
  it("deposit breakdown splits gross, fee, and net credit", () => {
    const result = calcDepositBreakdown("100000", "0.011");
    expect(result.grossRmb).toBe("100000.00");
    expect(result.feeRmb).toBe("1100.00");
    expect(result.netCreditRmb).toBe("98900.00");
  });

  it("period summary excludes reversed deposits and payouts", () => {
    const result = calcPeriodSummary([
      { type: "deposit", grossRmb: "100000.00", feeRmb: "1100.00", reversedAt: null },
      { type: "deposit", grossRmb: "30000.00", feeRmb: "330.00", reversedAt: "2026-06-09T00:00:00.000Z" },
      { type: "payout", payoutRmb: "100000.00", reversedAt: null },
      { type: "payout", payoutRmb: "50000.00", reversedAt: "2026-06-09T00:00:00.000Z" }
    ]);
    expect(result.totalGrossRmb).toBe("100000.00");
    expect(result.totalFeeRmb).toBe("1100.00");
    expect(result.totalPayoutRmb).toBe("100000.00");
  });

  it("wallet deposit profit RMB feeds dashboard totals from ledger", () => {
    const state = createSeedState();
    state.ledger.unshift({
      id: 9101,
      createdAt: "2026-06-09T10:00:00.000Z",
      entryType: "利潤",
      direction: "in",
      currency: "RMB",
      amount: "1100.00",
      description: "儲值服務費",
      operatorName: "admin",
      relatedTable: "special_client_wallet",
      relatedId: 1
    });
    expect(totals(state).walletDepositProfitRmb).toBe("1100.00");
  });

  it("reversal profit entry reduces wallet profit total", () => {
    const state = createSeedState();
    state.ledger.unshift(
      {
        id: 9102,
        createdAt: "2026-06-09T11:00:00.000Z",
        entryType: "利潤",
        direction: "out",
        currency: "RMB",
        amount: "400.00",
        description: "沖銷儲值服務費",
        operatorName: "admin",
        relatedTable: "special_client_wallet",
        relatedId: 2,
        isReversal: true,
        reversesLedgerId: 9101
      },
      {
        id: 9101,
        createdAt: "2026-06-09T10:00:00.000Z",
        entryType: "利潤",
        direction: "in",
        currency: "RMB",
        amount: "1100.00",
        description: "儲值服務費",
        operatorName: "admin",
        relatedTable: "special_client_wallet",
        relatedId: 1
      }
    );
    expect(totals(state).walletDepositProfitRmb).toBe("700.00");
  });
});
