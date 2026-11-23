/** A reply contract, not a saved customer fact or permission to change anything. */
export interface Clarification {
  kind: 'customer_detail' | 'saved_search' | 'context_changed' | 'verification_failure';
  question: string;
  purpose?: 'goal_progress';
}
export const UNKNOWN_REPLY = "I'm not sure";
export function clarificationInput(value: unknown): Clarification | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!['customer_detail', 'saved_search', 'context_changed', 'verification_failure'].includes(String(v.kind))) return null;
  const question = typeof v.question === 'string' ? v.question.trim() : '';
  if (!question || question.length > 240 || !question.endsWith('?') || (question.match(/\?/g) || []).length !== 1 || /[\n{}<>]/.test(question)) return null;
  if (/\b(?:password|passcode|PIN|CVV|CVC|security code|full card number|authentication code)\b/iu.test(question)) return null;
  return {kind: v.kind as Clarification['kind'], question};
}
/** Choices identify actual customer words or currently readable titles, never invented values. */
export function clarificationChoices(value: unknown, allowed: readonly string[]): string[] {
  const safe = new Set(allowed.map(s => s.trim()).filter(Boolean));
  const choices = Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string' && safe.has(s.trim())).map(s => s.trim()) : [];
  return [...new Set(choices)].filter(s => s.length <= 40 && !/[\n<>]|…|\.\.\./.test(s) && s !== UNKNOWN_REPLY).slice(0, 2).concat(UNKNOWN_REPLY);
}
