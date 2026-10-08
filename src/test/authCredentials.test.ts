import { describe, expect, it } from "vitest";
import { normalizePassword, normalizeUsername } from "../../api/_lib/authCredentials";

describe("authentication credential normalization", () => {
  it("removes accidental surrounding whitespace from usernames", () => {
    expect(normalizeUsername("  Operator01  ")).toBe("Operator01");
  });

  it("uses the same surrounding whitespace rule for passwords", () => {
    expect(normalizePassword("  pass1234  ")).toBe("pass1234");
  });

  it("turns missing credential values into empty strings", () => {
    expect(normalizeUsername(undefined)).toBe("");
    expect(normalizePassword(null)).toBe("");
  });
});
