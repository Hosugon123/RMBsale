import { describe, expect, it } from "vitest";
import { canVoidLedgerEntry } from "../lib/reversalUi";
import type { AppState, LedgerEntry } from "../lib/types";

function stateWithLedger(ledger: LedgerEntry[]): AppState {
  return {
    sessionUserId: 1,
    users: [],
    holders: [],
    accounts: [],
    customers: [],
    channels: [],
    purchases: [],
    sales: [],
    saleAllocations: [],
    rmbLots: [],
    ledger
  };
}

describe("reversal UI", () => {
  it("allows special client wallet cash ledger entries to be reversed from ledger tables", () => {
    const entry: LedgerEntry = {
      id: 10,
      createdAt: "2026-06-13T00:00:00.000Z",
      entryType: "特殊客戶儲值",
      accountId: 4,
      direction: "in",
      currency: "RMB",
      amount: "130000.00",
      description: "特殊客戶儲值入帳 0107支付寶 ¥130,000.00",
      operatorName: "6186",
      relatedTable: "special_client_wallet",
      relatedId: 7
    };

    expect(canVoidLedgerEntry(stateWithLedger([entry]), entry)).toEqual({
      entityType: "specialClientWallet",
      entityId: 7,
      label: "沖銷"
    });
  });

  it("hides special client wallet reversal action after a reversal ledger exists", () => {
    const entry: LedgerEntry = {
      id: 10,
      createdAt: "2026-06-13T00:00:00.000Z",
      entryType: "特殊客戶儲值",
      accountId: 4,
      direction: "in",
      currency: "RMB",
      amount: "130000.00",
      description: "特殊客戶儲值入帳 0107支付寶 ¥130,000.00",
      operatorName: "6186",
      relatedTable: "special_client_wallet",
      relatedId: 7
    };
    const reversal: LedgerEntry = {
      ...entry,
      id: 11,
      entryType: "特殊客戶沖銷",
      direction: "out",
      description: "沖銷特殊客戶儲值 0107支付寶 ¥130,000.00",
      relatedId: 8,
      isReversal: true,
      reversesLedgerId: 10
    };

    expect(canVoidLedgerEntry(stateWithLedger([entry, reversal]), entry)).toBeNull();
  });
});
