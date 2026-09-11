import { describe, expect, it } from "vitest";
import {
  getAccountAddress,
  getAccountId,
  getAccountIdFromPublicKey,
  getPublicKey,
  signBytes,
  verifySignature,
} from "../src/index.js";

describe("Arkovia cryptography", () => {
  it("matches the official public-key test vector", async () => {
    await expect(getPublicKey("12345678")).resolves.toBe(
      "a65ae5bc3cdaa9a0dd66f2a87459bbf663140060e99ae5d4dfe4dbef561fdd37",
    );
  });

  it("matches the official public-key to account test vector", async () => {
    const publicKey = "112e0c5748b5ea610a44a09b1ad0d2bddc945a6ef5edc7551b80576249ba585b";
    await expect(getAccountIdFromPublicKey(publicKey)).resolves.toBe(
      "5873880488492319831",
    );
    await expect(getAccountAddress(
      "hope peace happen touch easy pretend worthless talk them indeed wheel state",
    )).resolves.toBe("ARK-XK4R-7VJU-6EQG-7R335");
  });

  it("derives matching account information from a phrase", async () => {
    const phrase = "SDK deterministic test phrase";
    const publicKey = await getPublicKey(phrase);
    expect(await getAccountId(phrase)).toBe(await getAccountIdFromPublicKey(publicKey));
  });

  it("signs and verifies without sending the phrase anywhere", async () => {
    const phrase = "local signing test phrase";
    const message = "00112233445566778899aabbccddeeff";
    const publicKey = await getPublicKey(phrase);
    const signature = await signBytes(message, phrase);

    expect(signature).toHaveLength(128);
    await expect(verifySignature(signature, message, publicKey)).resolves.toBe(true);
    await expect(
      verifySignature(signature, "10112233445566778899aabbccddeeff", publicKey),
    ).resolves.toBe(false);
  });
});
