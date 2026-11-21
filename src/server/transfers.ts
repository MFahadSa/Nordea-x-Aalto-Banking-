/** v29/v31: how often and where a transfer goes, read from the customer's own words (shared by the AI path and the offline answers). */
/**
 * v29: one transfer now, or every month? The customer's words decide; when they say neither, a single amount is once.
 * v31: the model's own "once: false" no longer counts (it turned "move 40 € to the car fund" into a monthly card).
 * Only a plain yes to Abel's own monthly suggestion ("Want to move 300 € more each payday?" → "yes") is monthly.
 */
export function transferIsOnce(now: string, before: string, _modelSays?: unknown, offered = ''): boolean {
  const monthly = /\b(every|each|per|a)\s+(month|payday)\b|\bmonthly\b|\bregular(ly)?\b|\bstanding\b/i;
  const once = /\b(once|one[- ]?time|one[- ]?off|just (this|now|today)|right now|today|now|single)\b/i;
  if (once.test(now)) return true;
  if (monthly.test(now)) return false;
  if (/^\s*(yes|yeah|yep|sure|ok(ay)?|please|do it|go ahead|sounds good)\b/i.test(now) && monthly.test(offered) && !once.test(offered)) return false;
  if (once.test(before) && !monthly.test(before)) return true;
  if (monthly.test(before)) return false;
  return true;
}
/**
 * v31: which of the customer's own accounts the money goes to, from their words (never the model's):
 * 'carFund' when they name the car (fund), 'savings' otherwise. Moves the card can't do
 * (from savings or the car fund, or into the current account) are 'unsupported'.
 */
export function transferTarget(now: string, before: string): 'savings' | 'carFund' | 'unsupported' {
  const out = /\bfrom\s+(?:my\s+|the\s+|our\s+)?(?:savings|car\s*fund|car\s+savings)\b|\b(?:to|into)\s+(?:my\s+|the\s+|our\s+)?current\b|\bwithdraw\b/i;
  const car = /\bcar(?:\s*fund|\s+savings|\s+goal)?\b/i;
  const sav = /\b(savings?|save|flat|home|house|apartment|deposit)\b/i;
  if (out.test(now)) return 'unsupported';
  if (car.test(now)) return 'carFund';
  if (sav.test(now)) return 'savings';
  if (out.test(before)) return 'unsupported';
  // The last place they named, in their recent words.
  const last = (re: RegExp) => { let i = -1; for (const m of before.matchAll(re)) i = m.index ?? i; return i; };
  if (last(/\bcar\b/gi) > last(/\b(savings?|flat|home|house|apartment|deposit)\b/gi)) return 'carFund';
  return 'savings';
}
