import { describe, expect, it } from "vitest";
import {
  arkosToAtomic,
  atomicToArkos,
  assertMinimumTransactionFee,
} from "../src/index.js";

describe("ARKOS amount utilities", () => {
  it("converts ARKOS to atomic units without floating-point math", () => {
    expect(arkosToAtomic("1.23456789")).toBe(123_456_789n);
    expect(arkosToAtomic("0.01")).toBe(1_000_000n);
  });

  it("converts atomic units to canonical ARKOS strings", () => {
    expect(atomicToArkos(123_456_789n)).toBe("1.23456789");
    expect(atomicToArkos("-1000000")).toBe("-0.01");
  });

  it("rejects precision beyond eight decimals", () => {
    expect(() => arkosToAtomic("0.000000001")).toThrow(RangeError);
  });

  it("enforces the Arkovia minimum transaction fee", () => {
    expect(assertMinimumTransactionFee("0.01")).toBe(1_000_000n);
    expect(() => assertMinimumTransactionFee("0.009")).toThrow(RangeError);
  });
});
