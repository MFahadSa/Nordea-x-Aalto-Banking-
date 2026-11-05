// When no AI model can answer (all at their limits, or down), Abel still answers the common questions
// from the bank's own code: real numbers, no AI, no "busy" message. Anything else gets a short, honest line
// with options to tap. Cards (flat search, transfer, adviser) are made by the same code the AI uses.
import * as fin from './finance.js';
import { db } from './db.js';
import { CabinetEntry, MessageCard } from '../types.js';

const eur = (n: number) => Number(Math.round(n)).toLocaleString('fi-FI').replace(/ /g, ' ') + ' €';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
const month = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const CAT: Record<string, string> = { housing: 'Housing', groceries: 'Groceries', restaurants: 'Eating out', transport: 'Transport', bills: 'Bills', subscriptions: 'Subscriptions', shopping: 'Shopping', pharmacy: 'Pharmacy', other: 'Other' };

export interface OfflineReply {
  text: string;
  suggestions: string[];
  usedEntryIds: string[];
  topic: string;
  /** Tools to run through the normal tool code (they add cards). */
  actions?: { name: string; args: Record<string, unknown> }[];
}

/** First amount in the message, e.g. "1 290 €", "1290", "€1,290", "15k". */
function amountIn(text: string): number | undefined {
  const k = text.match(/(\d+(?:[.,]\d+)?)\s*k\b/i);
  if (k) return Math.round(Number(k[1].replace(',', '.')) * 1000);
  const m = text.match(/\d{1,3}(?:[  .]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/);
  if (!m) return undefined;
  let s = m[0].replace(/[  ]/g, '');
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s.replace(',', '.'));
  return n > 0 ? n : undefined;
}

export function offlineAnswer(userId: string, text: string, allowed: CabinetEntry[], reason: 'no_ai' | 'unclear' = 'no_ai'): OfflineReply {
  const t = text.toLowerCase();
  const u = db.getUser(userId)!;
  const allowedIds = new Set(allowed.map((e) => e.id));
  const goals = fin.activeGoals(userId).filter((g) => allowedIds.has(g.id));
  const main = goals.find((g) => g.goalType === 'home') || goals[0];
  const pills = ['Am I on track?', 'Where does my money go?', 'Plan my next payday'];

  // Looking for a flat / apartment / home (e.g. in Espoo): the partner offer card, if offers are on.
  if (/\b(flat|apartment|apartments|flats|home|house|asunto)\b/.test(t) && /\b(look|looking|search|find|buy|buying|for sale|view|espoo|helsinki|vantaa)/.test(t)) {
    const home = goals.find((g) => g.goalType === 'home');
    const st = home ? fin.goalStatus(userId, home) : null;
    const where = (t.match(/\b(espoo|helsinki|vantaa|tampere|turku)\b/) || [])[1];
    const place = where ? where[0].toUpperCase() + where.slice(1) : 'the area';
    const lines = [
      `Exciting! Flats in ${place} 🏡`,
      st ? `For “${st.title}” you have ${eur(st.saved)} of ${eur(st.target)} saved. At ${eur(st.monthlyGoingIn)} a month you’d have about ${eur(st.projectedByTargetDate)} by ${month(st.targetDate)}.` : '',
      !u.offersOff ? 'Here’s a partner that lists homes for sale.' : 'If you’d like, I can connect you with a Nordea home loan adviser.',
    ].filter(Boolean);
    return {
      text: lines.join('\n\n'),
      suggestions: ['How much can I borrow?', 'Am I on track?', 'Talk to a person'],
      usedEntryIds: home ? [home.id] : [],
      topic: 'home_buying',
      actions: u.offersOff ? [] : [{ name: 'suggestPartnerOffer', args: { partnerId: 'homes' } }],
    };
  }

  // Talk to a person.
  if (/\b(person|human|adviser|advisor|someone|call me|meeting|real person)\b/.test(t)) {
    return { text: 'Of course. Here’s what a Nordea adviser would see, once, if you connect:', suggestions: [], usedEntryIds: [], topic: 'person', actions: [{ name: 'startHandoff', args: { agentId: 'adviser' } }] };
  }

  // Can I afford X?
  const amt = amountIn(text);
  if (/\b(afford|can i (buy|pay|spend)|enough for|pay for)\b/.test(t) && amt) {
    const a = fin.affordability(userId, amt);
    const out = [
      a.canCoverFromSavings ? `Yes, ${eur(amt)} is covered by your savings (${eur(a.savingsBalance)}).` : `${eur(amt)} is more than your savings right now (${eur(a.savingsBalance)}).`,
      a.goalAffected && a.monthsOfSavingSetBack ? `It would set “${a.goalAffected}” back by about ${String(a.monthsOfSavingSetBack).replace('.', ',')} months of saving.` : '',
      !a.canCoverFromSavings && amt > (a.savingsBalance + a.currentBalance) * 3 ? 'Something this size, like a home, is usually paid mostly with a loan. A Nordea adviser can tell you what’s possible, free.' : `Your current account has ${eur(a.currentBalance)}.`,
    ].filter(Boolean);
    return { text: out.join('\n\n'), suggestions: ['Am I on track?', 'Plan my next payday'], usedEntryIds: main ? [main.id] : [], topic: 'afford' };
  }

  // Goals: on track?
  if (/\b(on track|track|goal|goals|deposit|progress|saving for|behind)\b/.test(t)) {
    if (!goals.length) return { text: 'You don’t have a goal with an amount and a date yet. Tell me what you’re saving for and by when, and I’ll track it with you.', suggestions: ['Help me set a savings goal'], usedEntryIds: [], topic: 'goals' };
    const parts = goals.slice(0, 3).map((g) => {
      const s = fin.goalStatus(userId, g);
      return s.onTrack
        ? `“${s.title}”: ${eur(s.saved)} of ${eur(s.target)}. You’re on track for ${month(s.targetDate)} 🎉`
        : `“${s.title}”: ${eur(s.saved)} of ${eur(s.target)}. At ${eur(s.monthlyGoingIn)} a month you’d have about ${eur(s.projectedByTargetDate)} by ${month(s.targetDate)}, so about ${eur(s.shortBy)} short. About ${eur(s.extraPerMonthNeeded)} more a month would get you there.`;
    });
    const plan = fin.payPlan(userId);
    const first = fin.goalStatus(userId, goals[0]);
    const offer = !first.onTrack && plan.suggestedExtraMove > 0;
    return {
      text: parts.join('\n\n') + (offer ? `\n\nWant to move ${eur(plan.suggestedExtraMove)} more each payday?` : ''),
      suggestions: offer ? [] : ['Plan my next payday', 'Where does my money go?'],
      usedEntryIds: goals.slice(0, 3).map((g) => g.id),
      topic: 'goals',
      actions: offer ? [{ name: 'offerTransfer', args: { amountPerMonth: plan.suggestedExtraMove } }] : [],
    };
  }

  // Spending.
  if (/\b(spend|spending|money go|where does|budget|expenses|costs|eating out|restaurants|groceries)\b/.test(t)) {
    const sp = fin.spending(userId, 3) as { averagePerMonthByCategory: Record<string, number>; averagePerMonthTotal: number; thisMonthSoFarTotal: number };
    const top = Object.entries(sp.averagePerMonthByCategory).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      text: `Over the last 3 months about ${eur(sp.averagePerMonthTotal)} a month went out:\n\n${top.map(([k, v]) => `• ${CAT[k] || k}: ${eur(v)}`).join('\n')}\n\nThis month so far: ${eur(sp.thisMonthSoFarTotal)}.`,
      suggestions: ['Plan my next payday', 'Am I on track?'],
      usedEntryIds: [],
      topic: 'spending',
    };
  }

  // Salary / payday.
  if (/\b(salary|pay|paid|payday|income|pension|raise)\b/.test(t)) {
    const s = fin.salaryInfo(userId);
    const p = fin.payPlan(userId);
    if (!s.found) return { text: 'I can’t see a salary or pension coming in yet.', suggestions: pills, usedEntryIds: [], topic: 'income' };
    return {
      text: [
        `Your latest pay was ${eur(s.latest)}, on the ${ordinal(s.payday)} of the month.${s.changed && s.difference > 0 ? ` That’s ${eur(s.difference)} more than before ${month(`${s.changeMonth}-01`)}.` : ''}`,
        `After about ${eur(p.spendingAveragePerMonth)} of spending and ${eur(p.alreadySavingPerMonth)} of saving, about ${eur(p.leftOver)} is left each month.${p.towardsGoal && p.suggestedExtraMove > 0 ? ` I’d suggest moving ${eur(p.suggestedExtraMove)} more to “${p.towardsGoal}”.` : ''}`,
      ].join('\n\n'),
      suggestions: ['Plan my next payday', 'Am I on track?'],
      usedEntryIds: main ? [main.id] : [],
      topic: 'income',
    };
  }

  // Balance.
  if (/\b(balance|how much (do i have|money)|accounts?|savings)\b/.test(t)) {
    const a = fin.accounts(userId)!;
    return {
      text: `Current account: ${eur(a.current.balance)}\n\nSavings: ${eur(a.savings.balance)} (${eur(a.savings.monthlyDeposit)} goes in each month)${a.carFund ? `\n\nCar fund: ${eur(a.carFund.balance)}` : ''}`,
      suggestions: ['Am I on track?', 'Where does my money go?'],
      usedEntryIds: [],
      topic: 'other',
    };
  }

  // Small talk.
  if (/\b(how are you|how's it going|how are things|what'?s up|whats up)\b/.test(t)) {
    return { text: `I’m good, thanks for asking! 😊 How about you, ${u.name}? Anything on your mind money-wise?`, suggestions: pills, usedEntryIds: [], topic: 'small_talk' };
  }
  if (/\b(thanks|thank you|kiitos)\b/.test(t)) return { text: 'You’re welcome! 💙', suggestions: [], usedEntryIds: [], topic: 'small_talk' };

  // Greetings.
  if (/^\s*(hi|hey|hello|moi|hei|terve|good (morning|evening|day))\b/.test(t)) {
    return { text: `Hi ${u.name}! 👋 What would you like to look at?`, suggestions: pills, usedEntryIds: [], topic: 'small_talk' };
  }

  // Anything else: honest and short, with options.
  return {
    text: reason === 'unclear'
      ? 'Sorry, I didn’t get that right. Could you say it another way? I can also help straight away with your goals, your spending, your pay or whether something is affordable.'
      : 'I can answer that properly in a few minutes. Right now I can help straight away with your goals, your spending, your pay and whether something is affordable.',
    suggestions: pills,
    usedEntryIds: [],
    topic: 'other',
  };
}

export type { MessageCard };
