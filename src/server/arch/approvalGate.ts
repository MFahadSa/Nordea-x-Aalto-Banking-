/**
 * R2: the owner's pass table, kept with its exact names.
 * Levels: 0 "No-risk certified", 1 "Review everything pass certified", 2 "High-risk pass certified".
 * Modes: "No permission" = every level passes; "Review everything" = levels 1 and 2 cannot pass;
 * "High risk mode" = only level 2 cannot pass. Cards that cannot pass wait in "waiting for you".
 * The level is assigned by the User AI's model (validated below), raised by the code floor, and carried in the approval id.
 */
export type ApprovalLevel = 0 | 1 | 2;
export type PermissionMode = 'No permission' | 'Review everything' | 'High risk mode';
export const LEVEL_NAMES: Record<ApprovalLevel, string> = {
  0: 'No-risk certified (level 0)',
  1: 'Review everything pass certified (level 1)',
  2: 'High-risk pass certified (level 2)',
};
export function canPass(mode: PermissionMode, level: ApprovalLevel): boolean {
  if (mode === 'No permission') return true;
  if (mode === 'Review everything') return level === 0;
  return level !== 2; // High risk mode
}

export const PERMISSION_MODES: PermissionMode[] = ['No permission', 'Review everything', 'High risk mode'];
/** Owner: the existing default stays "Review everything". */
export const DEFAULT_MODE: PermissionMode = 'Review everything';
export const asMode = (v: unknown): PermissionMode | undefined => PERMISSION_MODES.find((m) => m === v);

/**
 * Rubric the User AI follows (explainable, HIGHEST applicable level wins). USER cards only.
 *  L2 high-risk: sensitive personal content, OR an unsupported/inferred personal conclusion, OR intended external disclosure/offers.
 *  L1 review: evidenced, non-sensitive personal context.
 *  L0 no-risk: non-sensitive facts or intent the customer stated directly, or generic non-personal content.
 * Direct input never lowers a sensitive topic to L0. The code sensitivity guard (risk.ts) is a FLOOR, not a complete
 * wordlist guarantee. The model writes level + reason + evidence; the reason is audit text, not a self-certification.
 * A card the customer entered themselves (e.g. a goal they typed), restated without new claims, is "stated directly": L0.
 */
export const RUBRIC = 'L2: sensitive personal content, an inferred/unsupported personal conclusion, or intended external disclosure or offers. L1: evidenced non-sensitive personal context (anything the AI concluded or combined beyond what the customer said). L0: non-sensitive facts or intent stated directly by the customer (for example a goal they typed themselves, restated without new claims), or generic non-personal content. Highest applicable level wins.';
import { createHash } from 'node:crypto';
/** Consent version: covers what the customer consents to (title, detail, level, source). Timestamps, order and status are not part of it. */
export function contentHash(c: { title: string; detail: string; level: ApprovalLevel; source: string }): string {
  const n = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
  return createHash('sha256').update([n(c.title), n(c.detail), c.level, c.source].join('\u0001')).digest('hex').slice(0, 10);
}
/** The approval ID contains the level and the consent version: apv-L<level>-<hash>; a missing level is apv-L2-x<hash> (UNKNOWN). */
export function makeApprovalId(level: ApprovalLevel, suffix: string): string { return `apv-L${level}-${suffix}`; }
export const isUnknownId = (id: string) => /^apv-L2-x[0-9a-f]+$/.test(id);
/**
 * The CODE FLOOR under the User AI's level. It can only RAISE a level, never set or lower one: a sensitive topic or an
 * inferred personal conclusion is level 2 whatever the model says. Everything else is floor 0, so the level itself
 * comes from the User AI's model (owner: "The user AI will determine the risk level").
 */
export function codeFloor(c: { risk: 'low' | 'medium' | 'high'; observed: 'observed' | 'inferred' }): { level: ApprovalLevel; reason: string } {
  if (c.risk === 'high') return { level: 2, reason: 'code floor: sensitive topic, inference or disclosure' };
  if (c.observed === 'inferred') return { level: 2, reason: 'code floor: unsupported or inferred personal conclusion' };
  return { level: 0, reason: '' };
}
/** The User AI model's level for one card, as validated by code. */
export interface ModelLevel { level: ApprovalLevel; reason: string; evidence: string[]; by?: string }
/**
 * Validate ONE model answer for ONE card. Returns null (= no claim = UNKNOWN = effective level 2) unless:
 * the level is the integer 0, 1 or 2; the reason is 8-300 characters; and at least one evidence item is provenance code
 * can check: "goal:<id>" for a goal behind THIS card, or a verbatim phrase (4+ chars) from the card or its own goal row.
 * Evidence items that fail the check are dropped; a card left with none is UNKNOWN.
 */
export function validateModelLevel(raw: unknown, card: { goalIds: string[]; texts: string[] }): ModelLevel | null {
  const r = raw as { level?: unknown; reason?: unknown; evidence?: unknown } | null | undefined;
  if (!r || (r.level !== 0 && r.level !== 1 && r.level !== 2)) return null;
  const reason = typeof r.reason === 'string' ? r.reason.trim() : '';
  if (reason.length < 8 || reason.length > 300) return null;
  const hay = card.texts.join('\n').toLowerCase();
  const evidence = (Array.isArray(r.evidence) ? r.evidence : [])
    .filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
    .filter((x) => { const g = /^goal:(.+)$/.exec(x); return g ? card.goalIds.includes(g[1]) : x.length >= 4 && x.length <= 200 && hay.includes(x.toLowerCase()); })
    .slice(0, 5);
  if (!evidence.length) return null;
  return { level: r.level, reason, evidence };
}
/** Highest applicable level wins: the model's level, raised (never lowered) by the code floor. */
export const withFloor = (model: ApprovalLevel, floor: ApprovalLevel): ApprovalLevel => (Math.max(model, floor) as ApprovalLevel);
/**
 * The EFFECTIVE approval of a user card, derived from the card's own content at pass time (never from the claim alone):
 * the claim is valid only when its level is 0-2, its id carries that level AND the consent version matches the current
 * content. Missing, invalid, unparseable or stale (content changed) claims are UNKNOWN: effective level 2, id apv-L2-x<hash>.
 * The sensitivity floor can only raise a claimed level to 2.
 */
export function effectiveApproval(payload: unknown, c: { title: string; detail: string; source: string; risk: 'low' | 'medium' | 'high' }): { id: string; level: ApprovalLevel; unknown: boolean; reason: string } {
  const claim = readApproval(payload);
  const withLevel = (level: ApprovalLevel) => makeApprovalId(level, contentHash({ ...c, level }));
  if (!claim || claim.id !== withLevel(claim.level)) {
    const h = contentHash({ ...c, level: 2 });
    return { id: `apv-L2-x${h}`, level: 2, unknown: true, reason: claim ? 'approval no longer matches the card content' : 'the AI gave no valid level' };
  }
  const level: ApprovalLevel = c.risk === 'high' ? 2 : claim.level;
  return { id: withLevel(level), level, unknown: false, reason: '' };
}
/** A proposal carries a claim only when payload.approval has a valid level AND an id that contains that same level. */
export function readApproval(payload: unknown): { id: string; level: ApprovalLevel } | null {
  const a = (payload as { approval?: { id?: unknown; level?: unknown } } | undefined)?.approval;
  if (!a || (a.level !== 0 && a.level !== 1 && a.level !== 2) || typeof a.id !== 'string') return null;
  return a.id.startsWith(`apv-L${a.level}-`) && a.id.length > 7 ? { id: a.id, level: a.level } : null;
}
