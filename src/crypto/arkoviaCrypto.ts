import curve25519 from "./curve25519.js";
import { accountIdToAddress } from "../utils/account.js";
import { bytesToHex, concatBytes, equalBytes, hexToBytes } from "./bytes.js";

const encoder = new TextEncoder();

export type BytesLike = Uint8Array | string;

function subtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto SHA-256 support is required.");
  }
  return subtle;
}

function asBytes(value: BytesLike, encoding: "utf8" | "hex"): Uint8Array {
  if (value instanceof Uint8Array) return value;
  return encoding === "hex" ? hexToBytes(value) : encoder.encode(value);
}

async function sha256(...values: readonly Uint8Array[]): Promise<Uint8Array> {
  const digest = await subtleCrypto().digest("SHA-256", concatBytes(...values));
  return new Uint8Array(digest);
}

function curveArray(value: Uint8Array): number[] {
  return Array.from(value);
}

function asUint8(value: ArrayLike<number>): Uint8Array {
  return Uint8Array.from(value, (item) => item & 0xff);
}

export async function getPublicKey(secretPhrase: string): Promise<string> {
  if (!secretPhrase) throw new TypeError("A non-empty secret phrase is required.");
  const digest = await sha256(encoder.encode(secretPhrase));
  const publicKey = curve25519.keygen(curveArray(digest)).p;
  return bytesToHex(publicKey);
}

export async function getAccountIdFromPublicKey(publicKeyHex: string): Promise<string> {
  const publicKey = hexToBytes(publicKeyHex);
  if (publicKey.length !== 32) {
    throw new RangeError("An Arkovia public key must contain 32 bytes.");
  }
  const digest = await sha256(publicKey);
  let accountId = 0n;
  for (let i = 7; i >= 0; i -= 1) {
    accountId = accountId * 256n + BigInt(digest[i]!);
  }
  return accountId.toString();
}

export async function getAccountId(secretPhrase: string): Promise<string> {
  return getAccountIdFromPublicKey(await getPublicKey(secretPhrase));
}

export async function getAccountAddress(secretPhrase: string): Promise<string> {
  return accountIdToAddress(await getAccountId(secretPhrase));
}

/**
 * Signs bytes using Arkovia's deterministic Curve25519 signature scheme.
 * Strings are interpreted as hexadecimal transaction/message bytes.
 */
export async function signBytes(
  message: BytesLike,
  secretPhrase: string,
): Promise<string> {
  if (!secretPhrase) throw new TypeError("A non-empty secret phrase is required.");
  const messageBytes = asBytes(message, "hex");
  const secretDigest = await sha256(encoder.encode(secretPhrase));
  const signingKey = curve25519.keygen(curveArray(secretDigest)).s;
  const messageDigest = await sha256(messageBytes);
  const x = await sha256(messageDigest, asUint8(signingKey));
  const y = curve25519.keygen(curveArray(x)).p;
  const h = await sha256(messageDigest, asUint8(y));
  const v = curve25519.sign(curveArray(h), curveArray(x), signingKey);
  if (!v) throw new Error("Curve25519 could not produce a signature.");
  return bytesToHex(concatBytes(asUint8(v), h));
}

export async function verifySignature(
  signatureHex: string,
  message: BytesLike,
  publicKeyHex: string,
): Promise<boolean> {
  const signature = hexToBytes(signatureHex);
  const publicKey = hexToBytes(publicKeyHex);
  if (signature.length !== 64 || publicKey.length !== 32) return false;

  const v = signature.slice(0, 32);
  const h = signature.slice(32);
  const y = curve25519.verify(curveArray(v), curveArray(h), curveArray(publicKey));
  const messageDigest = await sha256(asBytes(message, "hex"));
  const expected = await sha256(messageDigest, asUint8(y));
  return equalBytes(h, expected);
}
