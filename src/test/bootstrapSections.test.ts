import { describe, expect, it } from "vitest";
import { REFRESH_PROFILES } from "../lib/bootstrapSections";

describe("bootstrap refresh profiles", () => {
  it("refreshes every data source needed by account adjustment summaries", () => {
    expect(REFRESH_PROFILES.adjustment).toEqual(
      expect.arrayContaining(["accounts", "sales", "rmbLots", "ledger"])
    );
  });

  it("keeps full reversal refresh aligned with all accounting sources", () => {
    expect(REFRESH_PROFILES.reversal).toEqual(
      expect.arrayContaining(["accounts", "customers", "purchases", "sales", "rmbLots", "saleAllocations", "ledger"])
    );
  });
});
