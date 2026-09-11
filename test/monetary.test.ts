import { describe, expect, it } from "vitest";
import { getPublicKey, verifyUnsignedTransaction } from "../src/index.js";

function u16(b: Uint8Array, o: number, v: number) { new DataView(b.buffer).setUint16(o, v, true); }
function u32(b: Uint8Array, o: number, v: number) { new DataView(b.buffer).setUint32(o, v, true); }
function u64(b: Uint8Array, o: number, v: bigint) { new DataView(b.buffer).setBigUint64(o, v, true); }
function hex(b: Uint8Array) { return Array.from(b, v => v.toString(16).padStart(2, "0")).join(""); }

async function monetary(subtype: number, attachment: bigint[]): Promise<{ bytes: string; key: string }> {
  const key = await getPublicKey("monetary test phrase");
  const b = new Uint8Array(177 + attachment.length * 8);
  b[0] = 5; b[1] = 0x10 | subtype;
  u16(b, 6, 1440); b.set(Uint8Array.from(key.match(/../g)!.map(x => parseInt(x, 16))), 8);
  u64(b, 56, 1000000n); u32(b, 160, 0); b[176] = 1;
  attachment.forEach((v, i) => u64(b, 177 + i * 8, v));
  return { bytes: hex(b), key };
}

describe("Monetary System transaction verification", () => {
  it("verifies currency buy and sell attachments", async () => {
    for (const subtype of [5, 6]) {
      const { bytes, key } = await monetary(subtype, [123n, 2500000n, 40n]);
      expect(() => verifyUnsignedTransaction(bytes, {
        type: 5, subtype, senderPublicKey: key, recipient: "0",
        amountNQT: "0", feeNQT: "1000000", deadline: 1440,
        currency: "123", rateNQT: "2500000", units: "40",
      })).not.toThrow();
    }
  });

  it("verifies currency mint attachments", async () => {
    const { bytes, key } = await monetary(7, [123n, 987654n, 10n, 4n]);
    expect(() => verifyUnsignedTransaction(bytes, {
      type: 5, subtype: 7, senderPublicKey: key, recipient: "0",
      amountNQT: "0", feeNQT: "1000000", deadline: 1440,
      currency: "123", nonce: "987654", units: "10", counter: "4",
    })).not.toThrow();
  });

  it("rejects a changed exchange rate", async () => {
    const { bytes, key } = await monetary(5, [123n, 2500000n, 40n]);
    expect(() => verifyUnsignedTransaction(bytes, {
      type: 5, subtype: 5, senderPublicKey: key, recipient: "0",
      amountNQT: "0", feeNQT: "1000000", deadline: 1440,
      currency: "123", rateNQT: "2500001", units: "40",
    })).toThrow("rateNQT");
  });
});
