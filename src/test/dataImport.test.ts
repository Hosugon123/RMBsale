import { describe, expect, it } from "vitest";
import { applyBusinessImport, parseBusinessImportJson } from "../lib/dataImport";
import { clearBusinessData, createSeedState } from "../lib/localStore";

describe("data import", () => {
  it("clears business data but keeps users", () => {
    const state = createSeedState();
    const cleared = clearBusinessData(state);
    expect(cleared.users.length).toBeGreaterThan(0);
    expect(cleared.accounts).toEqual([]);
    expect(cleared.ledger).toEqual([]);
    expect(cleared.purchases).toEqual([]);
  });

  it("parses business import json", () => {
    const payload = parseBusinessImportJson(
      JSON.stringify({
        holders: [{ id: 1, name: "甲", isActive: true }],
        accounts: []
      })
    );
    expect(payload.holders).toHaveLength(1);
    const state = applyBusinessImport(1, createSeedState().users, payload);
    expect(state.holders[0].name).toBe("甲");
  });

  it("rejects json with users", () => {
    expect(() => parseBusinessImportJson(JSON.stringify({ users: [] }))).toThrow("不可包含 users");
  });
});
