/*
 * Reed-Solomon account encoding compatible with Arkovia/Nxt.
 * Algorithm originally published to the public domain by NxtChg.
 */

const INITIAL_CODEWORD = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as const;
const GEXP = [1, 2, 4, 8, 16, 5, 10, 20, 13, 26, 17, 7, 14, 28, 29, 31, 27, 19, 3, 6, 12, 24, 21, 15, 30, 25, 23, 11, 22, 9, 18, 1] as const;
const GLOG = [0, 0, 1, 18, 2, 5, 19, 11, 3, 29, 6, 27, 20, 8, 12, 23, 4, 10, 30, 17, 7, 22, 28, 26, 21, 25, 9, 16, 13, 14, 24, 15] as const;
const CODEWORD_MAP = [3, 2, 1, 0, 7, 6, 5, 4, 13, 14, 15, 16, 12, 8, 9, 10, 11] as const;
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const MAX_ACCOUNT_ID = (1n << 64n) - 1n;

function gmult(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GEXP[(GLOG[a]! + GLOG[b]!) % 31]!;
}

function checksumIsValid(codeword: readonly number[]): boolean {
  let sum = 0;
  for (let i = 1; i < 5; i += 1) {
    let value = 0;
    for (let j = 0; j < 31; j += 1) {
      if (j > 12 && j < 27) continue;
      const position = j > 26 ? j - 14 : j;
      value ^= gmult(codeword[position]!, GEXP[(i * j) % 31]!);
    }
    sum |= value;
  }
  return sum === 0;
}

function normalizeBody(address: string, prefix: string): string {
  const normalized = address.trim().toUpperCase();
  const expected = `${prefix.toUpperCase()}-`;
  if (!normalized.startsWith(expected)) {
    throw new TypeError(`Expected an ${prefix.toUpperCase()}- address.`);
  }
  return normalized.slice(expected.length).replace(/-/g, "");
}

export function encodeReedSolomon(
  accountId: string | bigint,
  prefix = "ARK",
): string {
  const value = BigInt(accountId);
  if (value < 0n || value > MAX_ACCOUNT_ID) {
    throw new RangeError("Account ID must be an unsigned 64-bit integer.");
  }

  let remaining = value;
  const codeword: number[] = [...INITIAL_CODEWORD];
  let position = 0;
  do {
    codeword[position] = Number(remaining % 32n);
    remaining /= 32n;
    position += 1;
  } while (remaining > 0n);

  const parity: number[] = [0, 0, 0, 0];
  for (let i = 12; i >= 0; i -= 1) {
    const feedback = codeword[i]! ^ parity[3]!;
    parity[3] = parity[2]! ^ gmult(30, feedback);
    parity[2] = parity[1]! ^ gmult(6, feedback);
    parity[1] = parity[0]! ^ gmult(9, feedback);
    parity[0] = gmult(17, feedback);
  }
  codeword.splice(13, 4, ...parity);

  let body = "";
  for (let i = 0; i < 17; i += 1) {
    body += ALPHABET[codeword[CODEWORD_MAP[i]!]!]!;
    if ((i & 3) === 3 && i < 13) body += "-";
  }
  return `${prefix.toUpperCase()}-${body}`;
}

export function decodeReedSolomon(
  address: string,
  prefix = "ARK",
): string {
  const body = normalizeBody(address, prefix);
  if (body.length !== 17) {
    throw new TypeError("Invalid Reed-Solomon address length.");
  }

  const codeword = [...INITIAL_CODEWORD];
  for (let i = 0; i < body.length; i += 1) {
    const alphabetPosition = ALPHABET.indexOf(body[i]!);
    if (alphabetPosition < 0) {
      throw new TypeError("Invalid character in Reed-Solomon address.");
    }
    codeword[CODEWORD_MAP[i]!] = alphabetPosition;
  }

  if (!checksumIsValid(codeword)) {
    throw new TypeError("Invalid Reed-Solomon address checksum.");
  }

  let value = 0n;
  for (let i = 12; i >= 0; i -= 1) {
    value = value * 32n + BigInt(codeword[i]!);
  }
  if (value > MAX_ACCOUNT_ID) {
    throw new RangeError("Decoded account ID exceeds 64 bits.");
  }
  return value.toString();
}

export function isValidReedSolomon(
  address: string,
  prefix = "ARK",
): boolean {
  try {
    decodeReedSolomon(address, prefix);
    return true;
  } catch {
    return false;
  }
}
