/**
 * D12: one canonical customer-id rule shared by HTTP and every store seam.
 * A canonical id is one or more of [a-z0-9_-] (lowercase only: no silent lowercasing) and at most MAX_CUSTOMER_ID_LENGTH characters (a storage limit, not a style cap), and maps to its own files unchanged. Uppercase is rejected, so Lauri and lauri can never share a file on a case-insensitive disk.
 * Anything else (a.b, "a b", a/b, emails) is rejected with a typed error - never
 * rewritten to a look-alike id, so one id can no longer open another customer's data.
 */
export const CANONICAL_CUSTOMER_ID = /^[a-z0-9_-]+$/;

export class InvalidCustomerIdError extends Error {
  status = 400;
  code = 'INVALID_CUSTOMER_ID';
  constructor() { super('Invalid customer id: use lowercase letters, digits, "_" or "-" only.'); }
}

/**
 * Storage preflight (G59). Every file name the store derives from an id is `<id><suffix>`; one path
 * component is at most 255 bytes on the filesystem measured here. The longest suffix is the legacy
 * `.nordea.json.migrated` rename (21), so an id longer than 255 - 21 = 234 would open some of its
 * files and fail on others. Rejected up front, before any index or file write. Not truncated, hashed or rewritten.
 * Narrower full-path limits on other systems are NOT covered by this number.
 */
export const STORAGE_NAME_MAX = 255;
export const STORAGE_SUFFIXES = [
  '.user.db', '.cm.db', '.nordea.db', '.bus.db',
  '.user.db-journal', '.cm.db-journal', '.nordea.db-journal', '.bus.db-journal',
  '.user.json', '.cm.json', '.nordea.json', '.bus.json',
  '.user.json.migrated', '.cm.json.migrated', '.nordea.json.migrated', '.bus.json.migrated',
  '.context.json', '.context.md',
];
export const MAX_CUSTOMER_ID_LENGTH = STORAGE_NAME_MAX - Math.max(...STORAGE_SUFFIXES.map((s) => s.length));

export class CustomerIdTooLongError extends InvalidCustomerIdError {
  constructor() {
    super();
    this.code = 'CUSTOMER_ID_TOO_LONG';
    this.message = `Customer id too long: at most ${MAX_CUSTOMER_ID_LENGTH} characters (storage file-name limit).`;
  }
}

export const isCanonicalCustomerId = (uid: unknown): uid is string =>
  typeof uid === 'string' && CANONICAL_CUSTOMER_ID.test(uid) && uid.length <= MAX_CUSTOMER_ID_LENGTH;

/** Returns the id unchanged, or throws InvalidCustomerIdError. */
export function canonicalCustomerId(uid: unknown): string {
  if (typeof uid === 'string' && CANONICAL_CUSTOMER_ID.test(uid) && uid.length > MAX_CUSTOMER_ID_LENGTH) throw new CustomerIdTooLongError();
  if (!isCanonicalCustomerId(uid)) throw new InvalidCustomerIdError();
  return uid;
}

/** The typed error for a bad id, or null when the id is canonical. Never throws. */
export function customerIdRejection(uid: unknown): InvalidCustomerIdError | null {
  try { canonicalCustomerId(uid); return null; } catch (e) { return e as InvalidCustomerIdError; }
}
