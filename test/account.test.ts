import { describe, expect, it } from "vitest";
import {
  accountIdToAddress,
  addressToAccountId,
  assertAccountIdentifier,
  isNumericAccountId,
  isValidArkoviaAddress,
} from "../src/index.js";

describe("Arkovia account utilities", () => {
  const knownAccountId = "1739068987193023818";
  const knownAddress = "ARK-MRCC-2YLS-8M54-3CMAJ";

  it("encodes a known Nxt-compatible account vector with the ARK prefix", () => {
    expect(accountIdToAddress(knownAccountId)).toBe(knownAddress);
  });

  it("decodes and checksum-validates a known address", () => {
    expect(addressToAccountId(knownAddress)).toBe(knownAccountId);
    expect(isValidArkoviaAddress(knownAddress)).toBe(true);
  });

  it("rejects an address with a changed checksum character", () => {
    expect(isValidArkoviaAddress("ARK-MRCC-2YLS-8M54-3CMAK")).toBe(false);
    expect(() => assertAccountIdentifier("ARK-MRCC-2YLS-8M54-3CMAK")).toThrow(
      TypeError,
    );
  });

  it("round-trips unsigned 64-bit account IDs", () => {
    for (const id of ["0", "1", "18446744073709551615"]) {
      expect(addressToAccountId(accountIdToAddress(id))).toBe(id);
    }
  });

  it("rejects account IDs outside the unsigned 64-bit range", () => {
    expect(isNumericAccountId("18446744073709551616")).toBe(false);
    expect(() => accountIdToAddress("18446744073709551616")).toThrow(RangeError);
  });
});
