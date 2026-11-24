/** Personal figures written in Nora's own words.
 *
 *  The model may state a personal figure in prose only when, near that figure, the sentence names what the
 *  figure is, and the value, unit and meaning all match one current role-bound fact (FINANCIAL FACT HANDLES).
 *  Anything else (an invented value, a value that exists but is described as something else, a unit that does
 *  not fit, a month name with no matching date, a percentage) is not verified, and the existing handle contract
 *  applies. This keeps natural sentences possible without letting unchecked personal numbers through:
 *  "Your average spending is 2 107 €" passes; "Your salary is 2 107 €" or "You have 1 390 € on your account"
 *  (a monthly left-over estimate) does not. */
import type { VerifiedFact } from './financialRegistry.js';

const STOP = new Set(['the', 'and', 'all', 'tracked', 'per', 'eur', 'euro', 'euros', 'month', 'months', 'monthly', 'your', 'you', 'for', 'with', 'this', 'that', 'are', 'was', 'about', 'around', 'roughly', 'current', 'plan', 'not']);
/** Extra words that name a field, beyond the words of its own name. */
const FIELD_WORDS: Record<string, string[]> = {
  current_income: ['salary', 'income', 'earn', 'earns', 'earning', 'paid', 'pay', 'wage', 'net', 'take-home'],
  previous_income: ['previous', 'previously', 'earlier', 'before', 'used', 'old', 'salary', 'income'],
  income_difference: ['more', 'rise', 'raise', 'increase', 'difference', 'extra', 'higher', 'change'],
  average_spending: ['average', 'usually', 'typically', 'normally', 'typical', 'spend', 'spending', 'spent', 'costs', 'cost'],
  current_month_spending: ['far', 'spent', 'spending', 'spend'],
  last_full_month_spending: ['last', 'previous', 'spent', 'spending'],
  saving_rate: ['save', 'saving', 'saved', 'aside', 'savings', 'put', 'putting', 'puts', 'contribution', 'contribute', 'toward', 'towards', 'into'],
  left_over_after_spending_and_saving: ['left', 'leftover', 'remains', 'remaining', 'remainder', 'spare', 'leaves', 'shortfall', 'short', 'deficit', 'minus', 'negative', 'over'],
  suggested_extra_not_approved: ['suggested', 'suggest', 'extra', 'could', 'additional'],
  hypothetical_additional_saving: ['extra', 'additional', 'more'],
  balance: ['balance', 'account', 'have', 'there'],
  remaining: ['still', 'needed', 'need', 'remaining', 'left', 'missing', 'short'],
  saved: ['saved', 'have', 'already', 'far', 'put'],
  months_left: ['months', 'left', 'remaining'],
  short_by: ['short', 'shortfall', 'behind', 'gap', 'missing'],
  extra_per_month: ['extra', 'additional', 'more', 'needed', 'need'],
  cost_rate: ['cost', 'costs', 'pay', 'pays', 'bill', 'fee', 'price'],
  target: ['target', 'goal', 'aim', 'aiming', 'want', 'need', 'reach'],
  target_date: ['target', 'deadline', 'goal', 'until'],
  duration: ['duration', 'takes', 'long', 'lasts'],
  requested_duration: ['over', 'within'],
  contract_end: ['ends', 'end', 'expires', 'until'],
  renewal: ['renews', 'renewal', 'renewed'],
  repayment_start: ['repayment', 'repay', 'repaying', 'starts', 'start', 'begins', 'begin'],
  due_day: ['due', 'day'],
  end_date: ['ends', 'end', 'finishes', 'until', 'off'],
  customer_stated_amount: ['mentioned', 'said', 'asked', 'want', 'wanted', 'move', 'moving', 'transfer', 'put', 'make', 'instead', 'change', 'prepare', 'new'],
  transfer_amount: ['transfer', 'move', 'moving', 'send', 'sending', 'put', 'putting', 'confirm', 'account', 'from'],
};
/** Words that, near a figure, claim a specific role. If one appears and the fact does not carry that role, it is
 *  a different claim ("salary" for a spending figure). */
const ROLE_CLAIMS: Record<string, string[]> = {
  income: ['salary', 'income', 'earn', 'earns', 'wage'],
  balance: ['balance', 'account'],
  target: ['target', 'goal'],
  saving: ['save', 'saving', 'saved', 'savings'],
  cost: ['spend', 'spent', 'spending', 'cost', 'costs', 'bill', 'bills', 'rent'],
};
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const words = (s: string) => (s.toLowerCase().normalize('NFKC').match(/[\p{L}-]{3,}/gu) || []).filter((w) => !STOP.has(w));
/** Words that say what the figure is (its field), as opposed to which item it belongs to. */
function fieldWords(f: VerifiedFact): Set<string> {
  return new Set([...words(f.field.replace(/_/g, ' ')), ...(FIELD_WORDS[f.field] || [])]);
}
function descriptor(f: VerifiedFact): Set<string> {
  return new Set([...words(f.entity.replace(/\(\d{4}-\d{2}\)/g, '')), ...fieldWords(f)]);
}
function roleOf(f: VerifiedFact): string[] {
  const own = new Set<string>([f.role]);
  if (/income/.test(f.field)) own.add('income');
  if (/spending|cost/.test(f.field)) own.add('cost');
  if (/saving|saved/.test(f.field)) own.add('saving');
  if (/target/.test(f.field)) own.add('target');
  if (/balance/.test(f.field)) own.add('balance');
  return [...own];
}

interface Token { value: number; start: number; end: number; raw: string }
function figures(clause: string): Token[] {
  const out: Token[] = [];
  const re = /\d{1,3}(?:[   ]\d{3})+(?:,\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?/g;
  for (const m of clause.matchAll(re)) {
    let t = m[0].replace(/[   ]/g, '');
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, ''); else t = t.replace(',', '.');
    const neg = /(?:^|[\s(])[-‑−]$/.test(clause.slice(Math.max(0, m.index! - 2), m.index!));
    const value = (neg ? -1 : 1) * Number(t);
    if (!Number.isNaN(value)) out.push({ value, start: m.index!, end: m.index! + m[0].length, raw: (neg ? '-' : '') + m[0] });
  }
  return out;
}

export type ProseFigureCheck = { ok: true; figures: number } | { ok: false; reason: string };

export function verifiedProseFigures(text: string, facts: VerifiedFact[]): ProseFigureCheck {
  let count = 0;
  const verified: number[] = [];
  for (const clause of text.replace(/^\s*\d{1,2}[.)]\s+/gm, '').split(/(?<=[.!?])\s+|\n+/u)) {
    if (/%|per ?cent\b/i.test(clause) && /\d/.test(clause)) return { ok: false, reason: `"${clause.trim()}" states a percentage; use financialAnswer or the checked background.` };
    const lower = clause.toLowerCase();
    const months = MONTHS.filter((m) => (m === 'may' ? /\bMay\b/.test(clause) : new RegExp(`\\b${m}\\b`, 'i').test(clause)));
    for (const tok of figures(clause)) {
      const after = lower.slice(tok.end).trim();
      const before = lower.slice(0, tok.start);
      const near = new Set(words(lower.slice(Math.max(0, tok.start - 60), Math.min(lower.length, tok.end + 50))));
      // The figure's own part of the sentence (between commas, semicolons or brackets): another role named in a
      // different part ("a positive balance, you're saving 150 €") is not a claim about this figure.
      const segStart = Math.max(...[',', ';', '(', ')'].map((ch) => lower.lastIndexOf(ch, tok.start - 1))) + 1;
      const segEndList = [',', ';', '(', ')'].map((ch) => lower.indexOf(ch, tok.end)).filter((i) => i >= 0);
      const own = new Set(words(lower.slice(segStart, segEndList.length ? Math.min(...segEndList) : lower.length)));
      const unit = /^(?:months?|kuukau)/.test(after) ? 'month' : /^(?:years?|vuo)/.test(after) ? 'year' : /^(?:weeks?|viik)/.test(after) ? 'week' : /^(?:days?|päiv)/.test(after) ? 'day' : 'EUR';
      const isYear = Number.isInteger(tok.value) && tok.value >= 1990 && tok.value <= 2100 && unit === 'EUR' && !/^(?:€|eur)/.test(after) && !/€\s*$/.test(before);
      if (!isYear && unit === 'EUR' && tok.value < 13 && !/^(?:€|eur)/.test(after)) continue; // a small count ("2 goals"), not an amount
      if (isYear && /\?\s*$/.test(clause.trim())) continue; // a year proposed in a question
      const approx = /\b(?:about|around|roughly|approximately|nearly|almost|over|under)\s*$/.test(before) || /~\s*$/.test(before);
      const matches = facts.filter((f) => {
        if (isYear) return f.kind === 'calendar' && f.calendar?.year === tok.value;
        if (f.kind !== 'quantity' || !f.quantity) return false;
        if (unit !== 'EUR') return f.quantity.unit === unit && f.quantity.value === tok.value;
        if (f.quantity.unit !== 'EUR') return false;
        const d = Math.abs(f.quantity.value - tok.value);
        return d <= 0.5 || (approx && d / Math.max(1, Math.abs(f.quantity.value)) <= 0.03);
      });
      // A simple sum, difference or ×/÷12 of figures already verified in this reply ("150 € a month is 1 800 € a year").
      const derived = !matches.length && !isYear && unit === 'EUR' && verified.some((a) => verified.some((b) => Math.abs(a + b - tok.value) <= 0.5 || (a !== b && Math.abs(a - b - tok.value) <= 0.5)) || Math.abs(a * 12 - tok.value) <= 0.5 || Math.abs(a / 12 - tok.value) <= 0.5);
      if (derived) { verified.push(tok.value); count++; continue; }
      if (!matches.length) return { ok: false, reason: `${tok.raw} in "${clause.trim()}" is not one of the current personal facts.` };
      const fits = matches.filter((f) => {
        const d = descriptor(f);
        // The sentence must say what the figure is ("you put 150 a month"), not only which item it belongs to
        // ("your sauna pot has 150 a month" names the item but not that 150 is its monthly saving).
        const fw = fieldWords(f);
        if (![...near].some((w) => fw.has(w))) return false;
        const roles = roleOf(f);
        // Another role named next to the figure, that this fact does not have, is a different claim.
        return !Object.entries(ROLE_CLAIMS).some(([role, claims]) => !roles.includes(role) && claims.some((w) => own.has(w) && !d.has(w)));
      });
      if (!fits.length) {
        const f = matches[0];
        return { ok: false, reason: `${tok.raw} in "${clause.trim()}" is the fact "${f.entity}: ${f.field.replace(/_/g, ' ')}", but the sentence does not describe it as that.` };
      }
      verified.push(tok.value); count++;
    }
    // A month name stated as a fact must be the month of a checked date, not an inference. A question that offers
    // months as choices ("January or March?") states nothing about the customer, so it is not checked here.
    if (/\?\s*$/.test(clause.trim())) continue;
    for (const m of months) {
      const idx = MONTHS.indexOf(m) + 1;
      const hasMonth = (f: VerifiedFact) => (f.kind === 'calendar' && f.calendar?.month === idx) || Number(/\b\d{4}-(\d{2})\b/.exec(f.entity)?.[1]) === idx;
      if (!facts.some(hasMonth)) return { ok: false, reason: `The month "${m}" in "${clause.trim()}" is not a checked date.` };
    }
  }
  return { ok: true, figures: count };
}

/** Exact complete catalogue sentences are source claims, not personal facts. No substring,
 * paraphrase, number-only matching or arithmetic can widen this lane. Remaining sentences
 * still use the unchanged personal checker, and callers must retain later source/policy checks.
 * The caller supplies only active, reviewed ASP/PS explanations, never request or model text.
 */
export function verifiedReplyFigures(text: string, facts: VerifiedFact[], productSentences: readonly string[]): ProseFigureCheck {
  const canonical = (s: string) => s.normalize('NFKC').replace(/\s+/gu, ' ').replace(/\d{1,3}(?:[ ,]\d{3})+(?!\d)/gu, n => n.replace(/[ ,]/g, '')).trim();
  const allowed = new Set(productSentences.filter(s => /\d/.test(s)).map(canonical));
  const personal = text.replace(/^\s*\d{1,2}[.)]\s+/gm, '').split(/(?<=[.!?])\s+|\n+/u)
    .filter(sentence => !allowed.has(canonical(sentence))).join('\n');
  return verifiedProseFigures(personal, facts);
}
