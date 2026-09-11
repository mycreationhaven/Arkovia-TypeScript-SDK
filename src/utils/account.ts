const NUMERIC_ACCOUNT = /^\d{1,20}$/;
const ARKOVIA_RS_ACCOUNT = /^ARK-(?:[2-9A-HJ-NP-Z]{4}-){3}[2-9A-HJ-NP-Z]{5}$/;

export function isNumericAccountId(value: string): boolean {
  return NUMERIC_ACCOUNT.test(value.trim());
}

/**
 * Performs a format check only. Reed-Solomon checksum verification will be
 * added with the local transaction-signing module.
 */
export function looksLikeArkoviaAddress(value: string): boolean {
  return ARKOVIA_RS_ACCOUNT.test(value.trim().toUpperCase());
}

export function assertAccountIdentifier(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!isNumericAccountId(normalized) && !looksLikeArkoviaAddress(normalized)) {
    throw new TypeError("Expected an ARK- address or numeric Arkovia account ID.");
  }
  return normalized;
}
