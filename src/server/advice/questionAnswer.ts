import type { ChatMessage, MessageCard } from '../../types.js';
import { db } from '../db.js';
import { FACTS, isFactKey, type FactKey } from './facts.js';
import { catalogue, factsOf, blockReason, whoOf } from './guard.js';
import { evaluate } from './evaluate.js';
import { handleAdviceAction } from './actions.js';
import { refusesStorage } from './purpose.js';

/** Closed-scope answer bridge. Model interpretation is a proposal, not permission.
 * Only the latest currently valid, unanswered question in this conversation can be answered.
 * Rich/uncertain prose stays a clarification, never silently becomes a stored yes/no.
 */
export function pendingQuestion(userId: string, conversationId: string, today: string) {
  const u = db.getUser(userId);
  if (!u) return null;
  const messages = db.getMessages(userId).filter(m => m.conversationId === conversationId).slice(-12);
  const m = [...messages].reverse().find(m => m.cards?.some(c => c.type === 'ask_fact'));
  if (!m || m.resolved) return null;
  const lastAgent = [...messages].reverse().find(x => x.sender === 'agent');
  // A bare yes/no must not answer a buried card after another question or topic.
  const interrupted = !!lastAgent && lastAgent.id !== m.id;
  const card = m?.cards?.find(c => c.type === 'ask_fact');
  const d = card?.data;
  if (!m || !card || !d || !isFactKey(String(d.fact))) return null;
  const fact = d.fact as keyof typeof FACTS;
  const versions = catalogue().filter(r => r.id === d.ruleId);
  const facts = factsOf(userId, today);
  const ev = evaluate(versions, facts, today);
  const rule = versions.find(r => r.version === ev.version);
  const st = { ...u.advice, rules: { ...u.advice?.rules } };
  const remembered = st.rules[String(d.ruleId)];
  if (remembered?.last === 'asked') delete st.rules[String(d.ruleId)];
  if (!rule || rule.version !== d.version || ev.status !== 'ask' || ev.ask?.fact !== fact || blockReason(rule, ev, st, whoOf(u), today)) return null;
  if (facts[fact].state === 'hidden') return null;
  // A dependent disclosure which has since become unreadable invalidates the question too.
  const refs = [...(m.usedEntryIds || []), ...(m.notes || []).flatMap(n => n.entryId ? [n.entryId] : [])];
  if (refs.some(id => { const e = db.getCabinetEntry(id); return !e || e.status === 'archived' || e.private || !e.readableBy?.abel; })) return null;
  return { message: m, card, fact, question: String(d.question), type: FACTS[fact].type, interrupted };
}

export function explicitQuestionValue(text: string, type: string): string | null {
  const t = text.normalize('NFKC').trim().toLowerCase().replace(/[.!]+$/g, '').trim();
  if (/^(?:not sure|i(?:'m| am) not sure|i don'?t know|en tiedä|en ole varma)$/.test(t)) return 'notSure';
  if (type === 'boolean') {
    if (/^(?:yes|yep|yeah|yes i have|yes i do|kyllä|joo)$/.test(t)) return 'yes';
    if (/^(?:no|nope|no i haven'?t|no i don'?t|ei|en)$/.test(t)) return 'no';
  }
  if (type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const dt = new Date(t);
    if (!Number.isNaN(+dt) && dt.toISOString().slice(0, 10) === t) return t;
  }
  return null;
}

export function answerPendingQuestion(userId: string, conversationId: string, today: string, text: string, args: Record<string, unknown>) {
  const fail = (error: string) => ({ saved: false as const, error });
  if (refusesStorage(text)) return fail('The customer does not want this saved. No fact was changed. Explain only; do not ask them to save it again.');
  const p = pendingQuestion(userId, conversationId, today);
  if (!p) {
    const old = db.getMessages(userId).filter(m => m.conversationId === conversationId).slice(-12).find(m => m.id === args.messageId);
    const oldCard = old?.cards?.find(c => c.type === 'ask_fact' && c.data?.fact === args.fact);
    const fact = String(args.fact || '');
    const facts = factsOf(userId, today);
    const u = db.getUser(userId)!;
    const live = catalogue().find(r => r.id === oldCard?.data?.ruleId && r.version === oldCard?.data?.version && r.validFrom <= today && (!r.validTo || r.validTo > today) && Date.parse(today)-Date.parse(r.source.checkedAt)<=r.reviewDays*86400000);
    const memory = u.advice?.rules?.[String(oldCard?.data?.ruleId)];
    if (!old || !oldCard || !isFactKey(fact) || facts[fact].state !== 'known' || !live || (u.offersOff && live.kind === 'product') || (live.regulated && (!u.age || u.age < 18)) || memory?.last === 'never' || memory?.last === 'accepted' || memory?.last === 'notNow') return fail('No current readable question or correctable answer matches this proposal. Nothing changed.');
    // A correction need not start with a special word. This path only proposes the
    // exact earlier question for review and never changes the saved fact by itself.
    const evidence = String(args.evidence || '').trim();
    const value = String(args.value || '');
    if (evidence.length < 3 || !text.includes(evidence) || (FACTS[fact].type === 'boolean' ? !['yes','no'].includes(value) : !explicitQuestionValue(value,'date'))) return fail('The correction is incomplete. No fact changed. Ask one material clarification.');
    const reviewCard: MessageCard = { ...oldCard, data: { ...oldCard.data, note: `Possible correction: ${value}. Nothing changed yet. Choose the correct answer to this question. Your previous answer is kept until you choose.` } };
    return { saved: false as const, shown: true as const, reviewCard, supersedesMessageId: old.id, instruction: 'A correction is proposed, not saved. Ask the customer to check the single corrected answer on the card. Do not claim the old fact changed.' };
  }
  if (args.messageId !== p.message.id || args.fact !== p.fact) return fail('There is no matching current unanswered question. Do not invent a fact or save anything.');
  const value = explicitQuestionValue(text, p.type);
  if (!value || p.interrupted) {
    // Interpretation may help a human review, but never becomes permission to save.
    const proposed = String(args.value || '');
    if (!['yes', 'no', 'notSure'].includes(proposed) && !(p.type === 'date' && explicitQuestionValue(proposed, 'date'))) return fail('The proposed value is invalid. Ask one material clarification.');
    if (p.type === 'boolean' && !['yes', 'no', 'notSure'].includes(proposed)) return fail('This is a yes/no question, not a date. No fact saved.');
    if (p.type === 'date' && !['notSure'].includes(proposed) && !explicitQuestionValue(proposed, 'date')) return fail('An exact full date is needed. Do not guess a day from a month or year.');
    const evidence = String(args.evidence || (p.interrupted && value ? text : '')).trim();
    if (evidence.length < 2 || !text.includes(evidence) || /\?|\b(?:maybe|perhaps|if|suppose|not sure|don.t know)\b/i.test(evidence)) return fail(`The meaning is uncertain. No fact was saved. Clarify only this question: ${p.question}`);
    const words = proposed === 'yes' ? 'Yes' : proposed === 'no' ? 'No' : proposed === 'notSure' ? 'Not sure' : proposed;
    const reviewCard: MessageCard = { ...p.card, data: { ...p.card.data, note: `I understood your reply as "${words}". Nothing saved yet. Please check the question and choose your answer. If you choose Yes or No, that answer will be saved in Nora knows, where you can change or delete it. Not sure leaves it unanswered.` } };
        // The replacement remains unanswered; its original is closed only when the caller stores this review.
    return { saved: false as const, shown: true as const, reviewCard, supersedesMessageId: p.message.id, instruction: 'No fact was saved. A question card below lets the customer check the interpretation. Briefly acknowledge the actual answer and explain only the uncertain detail. Do not restart intake or claim eligibility.' };
  }
  if (args.value !== value) return fail('The proposed answer does not match the explicit reply. No fact was changed.');
  const result = handleAdviceAction(userId, p.card, 'fact_answer', { value }, today);
  if (!result.ok) return fail(result.error || 'The current question could not be answered. Nothing was saved.');
  if (result.ok) db.updateMessage(p.message.id, { resolved: result.resolved });
  return { ...result, saved: true as const, savedIds: result.saved || [], currentQuestion: p.question };
}
