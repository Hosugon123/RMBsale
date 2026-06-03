import { describe, expect, it } from "vitest";
import { getLastSaleExchangeRate, stepSaleExchangeRate } from "../components/SaleExchangeRateField";
import { createSeedState } from "../lib/localStore";

describe("getLastSaleExchangeRate", () => {
  it("returns the newest sale exchange rate formatted to 4 decimals", () => {
    const state = createSeedState();
    expect(getLastSaleExchangeRate(state.sales)).toBe("4.5143");
  });

  it("returns null when there are no sales", () => {
    const state = createSeedState();
    state.sales = [];
    expect(getLastSaleExchangeRate(state.sales)).toBeNull();
  });
});

describe("stepSaleExchangeRate", () => {
  it("increments and decrements by 0.01", () => {
    expect(stepSaleExchangeRate("4.5100", "up")).toBe("4.5200");
    expect(stepSaleExchangeRate("4.5100", "down")).toBe("4.5000");
  });

  it("does not go below zero", () => {
    expect(stepSaleExchangeRate("0.0050", "down")).toBe("0.0000");
    expect(stepSaleExchangeRate("", "down")).toBe("0.0000");
  });
});
