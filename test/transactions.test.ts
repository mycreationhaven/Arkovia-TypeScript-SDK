import { describe, expect, it } from "vitest";
import {
  getPublicKey,
  hexToBytes,
  parseTransactionHeader,
  signTransactionBytes,
  verifySignature,
  verifyUnsignedTransaction,
} from "../src/index.js";

function writeU16(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer).setUint16(offset, value, true);
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer).setUint32(offset, value, true);
}

function writeU64(bytes: Uint8Array, offset: number, value: bigint): void {
  new DataView(bytes.buffer).setBigUint64(offset, value, true);
}

function makePayment(publicKeyHex: string): string {
  const bytes = new Uint8Array(176);
  bytes[0] = 0;
  bytes[1] = 0x10;
  writeU32(bytes, 2, 12345);
  writeU16(bytes, 6, 1440);
  bytes.set(hexToBytes(publicKeyHex), 8);
  writeU64(bytes, 40, 1739068987193023818n);
  writeU64(bytes, 48, 125000000n);
  writeU64(bytes, 56, 1000000n);
  writeU32(bytes, 160, 0);
  writeU32(bytes, 164, 100);
  writeU64(bytes, 168, 999n);
  return Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");
}

describe("transaction safety", () => {
  it("parses and verifies a requested ARKOS payment", async () => {
    const publicKey = await getPublicKey("transaction test phrase");
    const unsigned = makePayment(publicKey);
    const parsed = verifyUnsignedTransaction(unsigned, {
      type: 0,
      subtype: 0,
      senderPublicKey: publicKey,
      recipient: "1739068987193023818",
      amountNQT: "125000000",
      feeNQT: "1000000",
      deadline: 1440,
    });
    expect(parsed.ecBlockId).toBe("999");
    expect(parseTransactionHeader(unsigned).signature).toMatch(/^0{128}$/);
  });

  it("refuses to sign bytes whose sender does not match the phrase", async () => {
    const unsigned = makePayment(await getPublicKey("first phrase"));
    await expect(signTransactionBytes(unsigned, "second phrase")).rejects.toThrow(
      "does not match",
    );
  });

  it("inserts and self-verifies a local signature", async () => {
    const phrase = "transaction signing phrase";
    const publicKey = await getPublicKey(phrase);
    const unsigned = makePayment(publicKey);
    const signed = await signTransactionBytes(unsigned, phrase);

    expect(signed.signature).toHaveLength(128);
    expect(signed.transactionBytes.slice(96 * 2, 160 * 2)).toBe(signed.signature);
    await expect(verifySignature(signed.signature, unsigned, publicKey)).resolves.toBe(true);
    expect(signed.fullHash).toHaveLength(64);
    expect(BigInt(signed.transactionId)).toBeGreaterThanOrEqual(0n);
  });

  it("detects malicious changes before signing", async () => {
    const publicKey = await getPublicKey("transaction test phrase");
    const unsigned = makePayment(publicKey);
    expect(() =>
      verifyUnsignedTransaction(unsigned, {
        type: 0,
        subtype: 0,
        senderPublicKey: publicKey,
        recipient: "1739068987193023818",
        amountNQT: "125000001",
        feeNQT: "1000000",
        deadline: 1440,
      }),
    ).toThrow("amountNQT");
  });
});
