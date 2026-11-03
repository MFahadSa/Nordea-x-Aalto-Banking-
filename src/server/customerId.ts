/**
 * D12: one canonical customer-id rule shared by HTTP and every store seam.
 * A canonical id is 1-64 chars of [A-Za-z0-9_-] and maps to its own files unchanged.
 * Anything else (a.b, "a b", a/b, emails) is rejected with a typed error - never
 * rewritten to a look-alike id, so one id can no longer open another customer's data.
 */
export const CANONICAL_CUSTOMER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export class InvalidCustomerIdError extends Error {
  status = 400;
  code = 'INVALID_CUSTOMER_ID';
  constructor() { super('Invalid customer id: use 1-64 letters, digits, "_" or "-" only.'); }
}

export const isCanonicalCustomerId = (uid: unknown): uid is string => typeof uid === 'string' && CANONICAL_CUSTOMER_ID.test(uid);

/** Returns the id unchanged, or throws InvalidCustomerIdError. */
export function canonicalCustomerId(uid: unknown): string {
  if (!isCanonicalCustomerId(uid)) throw new InvalidCustomerIdError();
  return uid;
}
