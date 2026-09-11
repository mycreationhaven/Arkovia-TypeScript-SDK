import {
  decodeReedSolomon,
  encodeReedSolomon,
  isValidReedSolomon,
} from "./reedSolomon.js";

const NUMERIC_ACCOUNT = /^\d{1,20}$/;
const MAX_ACCOUNT_ID = (1n << 64n) - 1n;

export function isNumericAccountId(value: string): boolean {
  const normalized = value.trim();
  if (!NUMERIC_ACCOUNT.test(normalized)) return false;
  try {
    return BigInt(normalized) <= MAX_ACCOUNT_ID;
  } catch {
    return false;
  }
}

export function isValidArkoviaAddress(value: string): boolean {
  return isValidReedSolomon(value, "ARK");
}

/** @deprecated Use isValidArkoviaAddress for full checksum validation. */
export function looksLikeArkoviaAddress(value: string): boolean {
  return isValidArkoviaAddress(value);
}

export function accountIdToAddress(accountId: string | bigint): string {
  return encodeReedSolomon(accountId, "ARK");
}

export function addressToAccountId(address: string): string {
  return decodeReedSolomon(address, "ARK");
}

export function assertAccountIdentifier(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!isNumericAccountId(normalized) && !isValidArkoviaAddress(normalized)) {
    throw new TypeError(
      "Expected a checksum-valid ARK- address or unsigned 64-bit account ID.",
    );
  }
  return normalized;
}
