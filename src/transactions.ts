import { getPublicKey, signBytes, verifySignature } from "./crypto/arkoviaCrypto.js";
import { bytesToHex, concatBytes, hexToBytes } from "./crypto/bytes.js";
import { addressToAccountId, isNumericAccountId } from "./utils/account.js";

export const TRANSACTION_HEADER_BYTES = 176;
export const SIGNATURE_OFFSET = 96;
export const SIGNATURE_BYTES = 64;

export interface ParsedTransactionHeader {
  type: number;
  subtype: number;
  version: number;
  timestamp: number;
  deadline: number;
  senderPublicKey: string;
  recipient: string;
  amountNQT: string;
  feeNQT: string;
  referencedTransactionFullHash: string | null;
  signature: string;
  flags: number;
  ecBlockHeight: number;
  ecBlockId: string;
}

export interface TransactionIntent {
  type: number;
  subtype: number;
  senderPublicKey: string;
  recipient: string;
  amountNQT: string | bigint;
  feeNQT: string | bigint;
  deadline: number;
  currency?: string;
  units?: string | bigint;
  rateNQT?: string | bigint;
  nonce?: string | bigint;
  counter?: string | bigint;
  issuance?: {
    name: string;
    code: string;
    description: string;
    currencyType: number;
    initialSupply: string | bigint;
    reserveSupply: string | bigint;
    maxSupply: string | bigint;
    issuanceHeight: number;
    minReservePerUnitNQT: string | bigint;
    minDifficulty: number;
    maxDifficulty: number;
    ruleset: number;
    algorithm: number;
    decimals: number;
  };
}

export interface SignedTransaction {
  transactionBytes: string;
  signature: string;
  fullHash: string;
  transactionId: string;
}

function assertBounds(bytes: Uint8Array, offset: number, size: number): void {
  if (offset < 0 || size < 0 || offset + size > bytes.length) {
    throw new RangeError("Transaction bytes ended unexpectedly.");
  }
}

function readU16LE(bytes: Uint8Array, offset: number): number {
  assertBounds(bytes, offset, 2);
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  assertBounds(bytes, offset, 4);
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  ) >>> 0;
}

function readU64LE(bytes: Uint8Array, offset: number): bigint {
  assertBounds(bytes, offset, 8);
  let value = 0n;
  for (let i = 7; i >= 0; i -= 1) {
    value = value * 256n + BigInt(bytes[offset + i]!);
  }
  return value;
}

function allZero(bytes: Uint8Array): boolean {
  return bytes.every((value) => value === 0);
}

function normalizeAccountId(account: string): string {
  const value = account.trim().toUpperCase();
  return isNumericAccountId(value) ? value : addressToAccountId(value);
}

function normalizeUnsignedBytes(value: string): Uint8Array {
  const bytes = hexToBytes(value);
  if (bytes.length < TRANSACTION_HEADER_BYTES) {
    throw new RangeError("An Arkovia transaction must contain at least 176 bytes.");
  }
  return bytes;
}

export function parseTransactionHeader(
  transactionBytesHex: string,
): ParsedTransactionHeader {
  const bytes = normalizeUnsignedBytes(transactionBytesHex);
  const subtypeAndVersion = bytes[1]!;
  const reference = bytes.slice(64, 96);

  return {
    type: bytes[0]!,
    subtype: subtypeAndVersion & 0x0f,
    version: (subtypeAndVersion & 0xf0) >>> 4,
    timestamp: readU32LE(bytes, 2),
    deadline: readU16LE(bytes, 6),
    senderPublicKey: bytesToHex(bytes.slice(8, 40)),
    recipient: readU64LE(bytes, 40).toString(),
    amountNQT: readU64LE(bytes, 48).toString(),
    feeNQT: readU64LE(bytes, 56).toString(),
    referencedTransactionFullHash: allZero(reference)
      ? null
      : bytesToHex(reference),
    signature: bytesToHex(bytes.slice(SIGNATURE_OFFSET, SIGNATURE_OFFSET + SIGNATURE_BYTES)),
    flags: readU32LE(bytes, 160),
    ecBlockHeight: readU32LE(bytes, 164),
    ecBlockId: readU64LE(bytes, 168).toString(),
  };
}


function attachmentOffset(version: number): number {
  return version > 0 ? TRANSACTION_HEADER_BYTES + 1 : 160;
}

function readExchangeAttachment(
  bytes: Uint8Array,
  version: number,
): { currency: string; rateNQT: string; units: string } {
  const offset = attachmentOffset(version);
  assertBounds(bytes, offset, 24);
  return {
    currency: readU64LE(bytes, offset).toString(),
    rateNQT: readU64LE(bytes, offset + 8).toString(),
    units: readU64LE(bytes, offset + 16).toString(),
  };
}

function readMintAttachment(
  bytes: Uint8Array,
  version: number,
): { currency: string; nonce: string; units: string; counter: string } {
  const offset = attachmentOffset(version);
  assertBounds(bytes, offset, 32);
  return {
    currency: readU64LE(bytes, offset).toString(),
    nonce: readU64LE(bytes, offset + 8).toString(),
    units: readU64LE(bytes, offset + 16).toString(),
    counter: readU64LE(bytes, offset + 24).toString(),
  };
}

function readText(bytes: Uint8Array, offset: number, length: number): string {
  assertBounds(bytes, offset, length);
  return new TextDecoder("utf-8", { fatal: true }).decode(
    bytes.slice(offset, offset + length),
  );
}

function readIssuanceAttachment(bytes: Uint8Array, version: number) {
  let offset = attachmentOffset(version);
  const nameLength = bytes[offset++]!;
  const name = readText(bytes, offset, nameLength);
  offset += nameLength;
  const codeLength = bytes[offset++]!;
  const code = readText(bytes, offset, codeLength);
  offset += codeLength;
  const descriptionLength = readU16LE(bytes, offset);
  offset += 2;
  const description = readText(bytes, offset, descriptionLength);
  offset += descriptionLength;
  assertBounds(bytes, offset, 45);
  const result = {
    name,
    code,
    description,
    currencyType: bytes[offset++]!,
    initialSupply: readU64LE(bytes, offset).toString(),
    reserveSupply: readU64LE(bytes, offset + 8).toString(),
    maxSupply: readU64LE(bytes, offset + 16).toString(),
    issuanceHeight: readU32LE(bytes, offset + 24),
    minReservePerUnitNQT: readU64LE(bytes, offset + 28).toString(),
    minDifficulty: bytes[offset + 36]!,
    maxDifficulty: bytes[offset + 37]!,
    ruleset: bytes[offset + 38]!,
    algorithm: bytes[offset + 39]!,
    decimals: bytes[offset + 40]!,
  };
  offset += 41;
  return { ...result, endOffset: offset };
}

function readCurrencyAttachment(
  bytes: Uint8Array,
  version: number,
): { currency: string; units: string } {
  const offset = attachmentOffset(version);
  assertBounds(bytes, offset, 16);
  return {
    currency: readU64LE(bytes, offset).toString(),
    units: readU64LE(bytes, offset + 8).toString(),
  };
}

export function verifyUnsignedTransaction(
  transactionBytesHex: string,
  intent: TransactionIntent,
): ParsedTransactionHeader {
  const bytes = normalizeUnsignedBytes(transactionBytesHex);
  const parsed = parseTransactionHeader(transactionBytesHex);
  const failures: string[] = [];

  if (parsed.type !== intent.type) failures.push("type");
  if (parsed.subtype !== intent.subtype) failures.push("subtype");
  if (parsed.senderPublicKey !== intent.senderPublicKey.toLowerCase()) failures.push("senderPublicKey");
  if (parsed.recipient !== normalizeAccountId(intent.recipient)) failures.push("recipient");
  if (parsed.amountNQT !== BigInt(intent.amountNQT).toString()) failures.push("amountNQT");
  if (parsed.feeNQT !== BigInt(intent.feeNQT).toString()) failures.push("feeNQT");
  if (parsed.deadline !== intent.deadline) failures.push("deadline");
  if (parsed.referencedTransactionFullHash !== null) failures.push("referencedTransactionFullHash");
  if (!allZero(bytes.slice(SIGNATURE_OFFSET, SIGNATURE_OFFSET + SIGNATURE_BYTES))) failures.push("signature");
  if (parsed.flags !== 0) failures.push("appendix flags");

  if (intent.issuance) {
    if (parsed.type !== 5 || parsed.subtype !== 0) {
      failures.push("currency issuance type");
    } else {
      const actual = readIssuanceAttachment(bytes, parsed.version);
      const expected = intent.issuance;
      if (actual.name !== expected.name) failures.push("name");
      if (actual.code !== expected.code) failures.push("code");
      if (actual.description !== expected.description) failures.push("description");
      if (actual.currencyType !== expected.currencyType) failures.push("currencyType");
      if (actual.initialSupply !== BigInt(expected.initialSupply).toString()) failures.push("initialSupply");
      if (actual.reserveSupply !== BigInt(expected.reserveSupply).toString()) failures.push("reserveSupply");
      if (actual.maxSupply !== BigInt(expected.maxSupply).toString()) failures.push("maxSupply");
      if (actual.issuanceHeight !== expected.issuanceHeight) failures.push("issuanceHeight");
      if (actual.minReservePerUnitNQT !== BigInt(expected.minReservePerUnitNQT).toString()) failures.push("minReservePerUnitNQT");
      if (actual.minDifficulty !== expected.minDifficulty) failures.push("minDifficulty");
      if (actual.maxDifficulty !== expected.maxDifficulty) failures.push("maxDifficulty");
      if (actual.ruleset !== expected.ruleset) failures.push("ruleset");
      if (actual.algorithm !== expected.algorithm) failures.push("algorithm");
      if (actual.decimals !== expected.decimals) failures.push("decimals");
      if (actual.endOffset !== bytes.length) failures.push("unexpected issuance bytes");
    }
  } else if (intent.rateNQT !== undefined) {
    if (parsed.type !== 5 || (parsed.subtype !== 5 && parsed.subtype !== 6)) {
      failures.push("currency exchange type");
    } else {
      const attachment = readExchangeAttachment(bytes, parsed.version);
      if (attachment.currency !== BigInt(intent.currency ?? 0).toString()) failures.push("currency");
      if (attachment.rateNQT !== BigInt(intent.rateNQT).toString()) failures.push("rateNQT");
      if (attachment.units !== BigInt(intent.units ?? 0).toString()) failures.push("units");
      if (attachmentOffset(parsed.version) + 24 !== bytes.length) failures.push("unexpected exchange bytes");
    }
  } else if (intent.nonce !== undefined || intent.counter !== undefined) {
    if (parsed.type !== 5 || parsed.subtype !== 7) {
      failures.push("currency mint type");
    } else {
      const attachment = readMintAttachment(bytes, parsed.version);
      if (attachment.currency !== BigInt(intent.currency ?? 0).toString()) failures.push("currency");
      if (attachment.nonce !== BigInt(intent.nonce ?? 0).toString()) failures.push("nonce");
      if (attachment.units !== BigInt(intent.units ?? 0).toString()) failures.push("units");
      if (attachment.counter !== BigInt(intent.counter ?? 0).toString()) failures.push("counter");
      if (attachmentOffset(parsed.version) + 32 !== bytes.length) failures.push("unexpected mint bytes");
    }
  } else if (intent.currency !== undefined || intent.units !== undefined) {
    if (parsed.type !== 5 || parsed.subtype !== 3) {
      failures.push("currency transaction type");
    } else {
      const attachment = readCurrencyAttachment(bytes, parsed.version);
      if (attachment.currency !== BigInt(intent.currency ?? 0).toString()) failures.push("currency");
      if (attachment.units !== BigInt(intent.units ?? 0).toString()) failures.push("units");
      if (attachmentOffset(parsed.version) + 16 !== bytes.length) failures.push("unexpected transfer bytes");
    }
  } else if (bytes.length !== TRANSACTION_HEADER_BYTES) {
    failures.push("unexpected attachment");
  }

  if (failures.length > 0) {
    throw new Error(`Unsigned transaction did not match the requested intent: ${failures.join(", ")}.`);
  }
  return parsed;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const input = Uint8Array.from(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input.buffer);
  return new Uint8Array(digest);
}

export async function signTransactionBytes(
  unsignedTransactionBytes: string,
  secretPhrase: string,
): Promise<SignedTransaction> {
  const unsigned = normalizeUnsignedBytes(unsignedTransactionBytes);
  if (!allZero(unsigned.slice(SIGNATURE_OFFSET, SIGNATURE_OFFSET + SIGNATURE_BYTES))) {
    throw new Error("Expected unsigned transaction bytes with an empty signature field.");
  }

  const embeddedPublicKey = bytesToHex(unsigned.slice(8, 40));
  const derivedPublicKey = await getPublicKey(secretPhrase);
  if (embeddedPublicKey !== derivedPublicKey) {
    throw new Error("The transaction sender public key does not match the secret phrase.");
  }

  const unsignedHex = bytesToHex(unsigned);
  const signature = await signBytes(unsignedHex, secretPhrase);
  if (!(await verifySignature(signature, unsignedHex, embeddedPublicKey))) {
    throw new Error("Local signature self-verification failed.");
  }

  const signed = Uint8Array.from(unsigned);
  signed.set(hexToBytes(signature), SIGNATURE_OFFSET);

  const signatureHash = await sha256(hexToBytes(signature));
  const fullHashBytes = await sha256(concatBytes(unsigned, signatureHash));
  const fullHash = bytesToHex(fullHashBytes);
  const transactionId = readU64LE(fullHashBytes, 0).toString();

  return {
    transactionBytes: bytesToHex(signed),
    signature,
    fullHash,
    transactionId,
  };
}
