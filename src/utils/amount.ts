export const ARKOS_DECIMALS = 8;
export const ARKOS_ATOMIC_FACTOR = 100_000_000n;
export const MIN_TRANSACTION_FEE_ATOMIC = 1_000_000n;
export const MIN_TRANSACTION_FEE_ARKOS = "0.01";

function assertDecimalString(value: string): void {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) {
    throw new TypeError(`Invalid decimal amount: ${value}`);
  }
}

export function arkosToAtomic(value: string | number | bigint): bigint {
  if (typeof value === "bigint") {
    return value * ARKOS_ATOMIC_FACTOR;
  }

  const text = String(value).trim();
  assertDecimalString(text);

  const negative = text.startsWith("-");
  const unsigned = text.replace(/^[+-]/, "");
  const [whole = "0", fraction = ""] = unsigned.split(".");

  if (fraction.length > ARKOS_DECIMALS) {
    throw new RangeError("ARKOS supports at most 8 decimal places.");
  }

  const atomic =
    BigInt(whole || "0") * ARKOS_ATOMIC_FACTOR +
    BigInt(fraction.padEnd(ARKOS_DECIMALS, "0") || "0");

  return negative ? -atomic : atomic;
}

export function atomicToArkos(value: string | number | bigint): string {
  const atomic = BigInt(value);
  const negative = atomic < 0n;
  const absolute = negative ? -atomic : atomic;
  const whole = absolute / ARKOS_ATOMIC_FACTOR;
  const fraction = (absolute % ARKOS_ATOMIC_FACTOR)
    .toString()
    .padStart(ARKOS_DECIMALS, "0")
    .replace(/0+$/, "");

  const formatted = fraction ? `${whole}.${fraction}` : whole.toString();
  return negative ? `-${formatted}` : formatted;
}

export function assertMinimumTransactionFee(
  fee: string | number | bigint,
): bigint {
  const atomic = arkosToAtomic(fee);
  if (atomic < MIN_TRANSACTION_FEE_ATOMIC) {
    throw new RangeError(
      `Arkovia transaction fees must be at least ${MIN_TRANSACTION_FEE_ARKOS} ARKOS.`,
    );
  }
  return atomic;
}
