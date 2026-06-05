import { describe, expect, it } from "vitest";
import { ledgerDirectionLabel } from "../lib/ledgerDirectionLabel";

describe("ledgerDirectionLabel", () => {
  it("uses 收入/支出 for member account entries", () => {
    expect(ledgerDirectionLabel({ direction: "in", accountId: 1 })).toBe("收入");
    expect(ledgerDirectionLabel({ direction: "out", accountId: 4 })).toBe("支出");
  });

  it("uses 增加/減少 for receivable and payable entries", () => {
    expect(ledgerDirectionLabel({ direction: "in", accountId: undefined })).toBe("增加");
    expect(ledgerDirectionLabel({ direction: "out", accountId: undefined })).toBe("減少");
  });
});
