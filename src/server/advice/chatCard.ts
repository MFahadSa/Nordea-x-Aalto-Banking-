/**
 * v28: the recommender card for a chat reply, decided by code (see intent.ts).
 *
 * The customer brought the topic up, so this is not "pushing": the calm-view weekly limit and the
 * "not now" / "shown" waits do not block it. "Don't suggest this again" and "already done" still do,
 * and so do all the safety rules (minors, offers off, private facts, not live, not eligible).
 */
import {customerAssertion,customerFactAssertion,ownHistoryRead} from './purpose.js';
import type { ChatMessage, MessageCard } from '../../types.js';
import { db } from '../db.js';
import { FACTS, type FactKey, type Facts } from './facts.js';
import { evaluate } from './evaluate.js';
import { blockReason, catalogue, factsOf, logAdviceRead, remember, snapshot, whoOf } from './guard.js';
import { cardFor } from './cards.js';
import { saveAnswer } from './actions.js';
import { homeMovedToChat } from './home.js';
import {intentsOf,type Intent} from './intent.js';

export interface RuleCard {
  card: MessageCard;
  /** For the AI: what the app shows below its words. */
  describe: string;
  /** Answers taken from the customer's own words (saved, with Undo). */
  notes: NonNullable<ChatMessage['notes']>;
}

export function ruleCardFor(userId: string, conversationId: string, intent: Intent, today: string, undo: (entryId: string, title: string) => string, customerText?:string): RuleCard | null {
  if(customerText!==undefined&&ownHistoryRead(customerText))return null;
  const u = db.getUser(userId);
  if (!u || !intent.rule) return null;
  const versions = catalogue().filter((r) => r.id === intent.rule);
  if (!versions.length) return null;
  const st = u.advice || {};
  const mem = st.rules?.[intent.rule];
  if (mem && (mem.last === 'never' || mem.last === 'accepted')) return null;
  // The same card still open just above: don't show it twice.
  const recent = db.getMessages(userId).filter((m) => m.conversationId === conversationId).slice(-6);
  if (recent.some((m) => !m.resolved && (m.cards || []).some((k) => (k.type === 'opportunity' || k.type === 'ask_fact') && k.data?.ruleId === intent.rule))) return null;

  // What the words already answer counts as known for this check (only facts the customer gives).
  let facts: Facts = factsOf(userId, today);
  const asserted=customerText===undefined?intent.implies:Object.assign({},...customerText.split(/[.!?;:]|\bbut\b|,?\s+and\s+(?=(?:I|We)\b)/iu).filter(customerAssertion).flatMap(c=>intentsOf(c).filter(i=>i.rule===intent.rule).map(i=>Object.fromEntries(Object.entries(i.implies||{}).filter(([fact])=>customerFactAssertion(c,fact))))));
  const implied = Object.entries(asserted || {}).filter(([k]) => FACTS[k as FactKey]?.origin === 'customer') as [FactKey, boolean][];
  const withWords = { ...facts };
  for (const [k, v] of implied) if (withWords[k].state !== 'hidden') withWords[k] = { key: k, state: 'known', value: v, from: 'You said it in this chat' };
  const stNoWait = { ...st, rules: { ...(st.rules || {}) } };
  delete stNoWait.rules![intent.rule]; // asked about it now: no waiting time applies (never/accepted handled above)
  let ev = evaluate(versions, withWords, today);
  let rule = versions.find((r) => r.version === ev.version);
  if (!rule || blockReason(rule, ev, stNoWait, whoOf(u), today)) return null;

  // Save what the words answered (only facts the rule really used), so Home and later chats don't ask again.
  const notes: RuleCard['notes'] = [];
  for (const [k, v] of implied) {
    if (!ev.used.includes(k) || (facts[k].state === 'known' && facts[k].value === v)) continue;
    const e = saveAnswer(userId, rule.id, k, v, v ? 'Yes' : 'No', 'You said it in a chat');
    notes.push({ text: `📌 Nora will remember this: ${e.title}`, undoToken: undo(e.id, e.title), entryId: e.id });
  }
  if (notes.length) {
    facts = factsOf(userId, today);
    ev = evaluate(versions, facts, today);
    rule = versions.find((r) => r.version === ev.version);
    if (!rule || blockReason(rule, ev, stNoWait, whoOf(u), today)) return null;
  }
  logAdviceRead(userId, `Nora suggestions: checking “${rule.title}” (you asked about it)`, facts);
  const card = cardFor({ ...ev, rule }, facts, u.viewMode === 'calm');
  db.updateUser(userId, { advice: remember(db.getUser(userId)?.advice, rule.id, ev.status === 'ask' ? 'asked' : 'shown', today) });
  snapshot(userId, card, facts, ev.used, 'chat', today);
  homeMovedToChat(userId, rule.id);
  const describe = ev.status === 'ask'
    ? `The app shows ONE question card below your words: "${ev.ask!.question}" (it checks "${rule.title}"). Say in one short sentence why answering helps. Do not ask the question yourself and do not say they qualify.`
    : `The app shows ONE suggestion card below your words: "${rule.title}", with its numbers, reasons and official source.${rule.regulated ? ' Advice on it comes from a person, not from you.' : ''} Introduce it in one short sentence. Do not repeat its numbers and do not say they qualify.`;
  const ex = explainFor(rule.id, today);
  return { card, describe: ex ? `${describe} ${ex}` : describe, notes };
}

/** v29: the rule's own plain explanation (numbers from its params), for Nora when the customer asks how it works. */
export function explainFor(ruleId: string, today: string): string {
  const versions = catalogue().filter((r) => r.id === ruleId && r.validFrom <= today && (!r.validTo || r.validTo >= today));
  const r = versions.sort((a, b) => b.version.localeCompare(a.version))[0];
  if (!r) return '';
  const explanation = r.explain || r.message;
  const text = explanation.replace(/\{(\w+)\}/g, (m, k) => {
    const v = (r.params as Record<string, unknown>)[k];
    return typeof v === 'number' ? v.toLocaleString('fi-FI').replace(/\u00a0/g, ' ') : String(v ?? m);
  });
  return `HOW "${r.title}" WORKS (official, use only this if they ask; never add numbers): ${text}`;
}

/** v29: a rule card shown earlier in this chat: its explanation stays available for follow-up questions. */
export function earlierRuleExplain(userId: string, conversationId: string, today: string): string {
  const ids = new Set<string>();
  for (const m of db.getMessages(userId).filter((x) => x.conversationId === conversationId).slice(-12))
    for (const k of m.cards || []) if ((k.type === 'opportunity' || k.type === 'ask_fact') && k.data?.ruleId) ids.add(String(k.data.ruleId));
  return [...ids].map((id) => explainFor(id, today)).filter(Boolean).join(' ');
}
