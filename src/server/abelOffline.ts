// When no AI model can answer (all at their limits, or down), Nora still answers the common questions
// from the bank's own code: real numbers, no AI, no "busy" message. Anything else gets a short, honest line
// with options to tap. Cards (flat search, transfer, adviser) are made by the same code the AI uses.
import * as fin from './finance.js';
import { db } from './db.js';
import { FRAUD } from './safety.js';
import { transferIsOnce, transferTarget, transferClarification } from './transfers.js';
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

export function offlineAnswer(userId: string, text: string, allowed: CabinetEntry[], reason: 'no_ai' | 'unclear' = 'no_ai', before = ''): OfflineReply {
  const t = text.toLowerCase();
  const u = db.getUser(userId)!;
  const allowedIds = new Set(allowed.map((e) => e.id));
  const goals = fin.activeGoals(userId).filter((g) => allowedIds.has(g.id));
  const main = goals.find((g) => g.goalType === 'home') || goals[0];
  const pills = ['Am I on track?', 'Where does my money go?', 'Plan my next payday'];

  // v29: a scam or a lost card. The safety steps are put first by the caller; here: where the money is now.
  if (FRAUD.test(text)) {
    const acc = fin.accounts(userId)!;
    return {
      text: `Right now your current account has ${eur(acc.current.balance)} and your savings ${eur(acc.savings.balance)}. If you see a payment you don’t recognise, tell Nordea’s customer service about it when you call.`,
      suggestions: ['Talk to a person'],
      usedEntryIds: [],
      topic: 'other',
    };
  }

  // v31: right after a scam message, "I already gave them" / "I clicked it": the one thing to do now.
  if (FRAUD.test(before) && /\b(gave|shared|typed|told|clicked|tapped|sent|already|did|yes|done)\b/.test(t)) {
    return { text: 'Please call Nordea’s customer service now: the number is on the back of your card and on nordea.fi. They can lock your codes and cards so nobody can use them. You can also block your card yourself in the app under Cards.', suggestions: ['Talk to a person'], usedEntryIds: [], topic: 'other' };
  }

  // v31: hard moments come before any numbers.
  if (/\b(partner|husband|wife|boyfriend|girlfriend|spouse|family)\b[^.?!]{0,40}\b(controls?|controlling|takes? (all )?my|won['’]?t let|doesn['’]?t let|does not let|keeps? all my)\b|\bfinancial abuse\b/.test(t)) {
    return { text: 'I’m really sorry you’re dealing with this. Your own money and your own accounts are yours to see and use.\n\nA Nordea adviser can talk it through with you and look at your options. If you ever feel unsafe, call the emergency number 112.', suggestions: ['Talk to a person'], usedEntryIds: [], topic: 'other' };
  }
  if (/\b(lost|losing) (my|our) job\b|\b(laid off|been fired|got fired|unemployed|redundan\w*)\b/.test(t)) {
    const acc = fin.accounts(userId)!;
    const sp = fin.spending(userId, 3) as { averagePerMonthTotal: number };
    return { text: `I’m sorry, that’s a lot to take in. Here’s where you stand right now: ${eur(acc.current.balance)} on your current account and ${eur(acc.savings.balance)} in savings. Your spending has been about ${eur(sp.averagePerMonthTotal)} a month.\n\nA Nordea adviser can look at your options with you, free.`, suggestions: ['Where does my money go?', 'Talk to a person'], usedEntryIds: [], topic: 'income' };
  }
  if (/\b(stressed|stressful|anxious|anxiety|overwhelmed|can['’]?t sleep|cannot sleep|panicking|scared)\b/.test(t)) {
    return { text: 'I’m sorry it’s weighing on you. We can take it one small step at a time: I can show you where your money goes, or you can talk it through with a person.', suggestions: ['Where does my money go?', 'Talk to a person'], usedEntryIds: [], topic: 'other' };
  }
  if (/\b(complain|complaint|useless|terrible|awful|rubbish|angry|frustrat\w*)\b/.test(t)) {
    return { text: 'I’m sorry about that. You can tell a person directly: tap Talk to a person, or use Contact in the app.', suggestions: ['Talk to a person'], usedEntryIds: [], topic: 'other' };
  }

  // v31: privacy questions get straight answers.
  if (/\b(delete|remove|forget|erase|wipe)\b.*\b(everything|all)\b|\b(don['’]?t|do not|never|stop)\s+(save|saving|store|storing|keep|keeping|remember)\b/.test(t)) {
    return { text: 'You decide what I keep. Everything I know about you is in Nora knows: you can remove any note there, and choose what Nora and partner offers may use. I can’t delete it all from this chat in one go.', suggestions: [], usedEntryIds: [], topic: 'other' };
  }
  if (/\bwhat do you know\b|\bknow about me\b/.test(t)) {
    const list = allowed.filter((e) => e.status === 'active').slice(0, 5).map((e) => `• ${e.title}`);
    return { text: list.length ? `Here’s some of what I know:\n${list.join('\n')}\n\nYou can see all of it, and remove anything, in Nora knows.` : 'I don’t have any notes about you yet. Anything I keep will show in Nora knows, where you can remove it.', suggestions: [], usedEntryIds: list.length ? allowed.filter((e) => e.status === 'active').slice(0, 5).map((e) => e.id) : [], topic: 'other' };
  }
  if (/\b(data|info|information|privacy)\b/.test(t) && /\b(safe|secure|sell|sold|share|shared|who|see)\b/.test(t) || /\bwho can see\b/.test(t)) {
    return { text: 'You can check this yourself in Who sees it: it lists each time your notes were read, and what Nora, partner offers and advisers may use. An adviser sees nothing unless you connect, and you can change any of it there.', suggestions: [], usedEntryIds: [], topic: 'other' };
  }

  // v31: what Nora is and can do.
  if (/\b(are you (a )?(bot|robot|human|real|ai|person)|who are you|what are you)\b/.test(t)) {
    return { text: 'I’m Nora, an AI assistant in the Nordea app. You can talk to a person any time.', suggestions: ['Talk to a person', 'What can you do?'], usedEntryIds: [], topic: 'small_talk' };
  }
  if (/\b(what can you do|what do you do|how does this work|how do you work|what can i ask)\b|^\s*help\W*$/.test(t)) {
    return { text: 'I can show your balances and where your money goes, check whether something is affordable, track your goals and plan your payday. I can also prepare a move between your own accounts for you to confirm, and connect you with a Nordea adviser.', suggestions: pills, usedEntryIds: [], topic: 'other' };
  }

  // v31: cards, codes and logins: never in chat.
  if (/\b(block|freeze|lock|cancel)\b[^.?!]{0,20}\b(card|it)\b/.test(t) && /\b(card|block|freeze)\b/.test(`${t} ${before.toLowerCase()}`)) {
    return { text: 'I can’t block a card from this chat. You can block it yourself in the app under Cards, or call Nordea’s customer service: the number is on nordea.fi.', suggestions: ['Talk to a person'], usedEntryIds: [], topic: 'other' };
  }
  if (/\b(pin|card number|cvv|cvc|password|passcode|bank ?id|login)\b/.test(t)) {
    return { text: 'I can’t see or share your PIN, card number, codes or password, and you should never give them to anyone who asks in a call or a message. You can manage them yourself in the app.', suggestions: [], usedEntryIds: [], topic: 'other' };
  }

  // v31: money moves. Bills and other people: Payments in the app. Own accounts: the confirm card.
  if (!/\bdid (i|we) pay\b/.test(t) && (/\bpay\b[^.?!]{0,20}\b(bill|invoice|loan)\b|\b(bill|invoice)\b[^.?!]{0,20}\bpay\b/.test(t))) {
    return { text: 'I can’t pay bills from this chat. You can pay them in the app under Payments, and scan an invoice there too.', suggestions: [], usedEntryIds: [], topic: 'other' };
  }
  if (/\b(send|pay|wire|give|lend)\b[^.?!]*\bto\s+(my\s+)?(mom|mum|mother|dad|father|friend|brother|sister|partner|wife|husband|son|daughter|[a-zåäö]+\s+account)\b/.test(t) && !/\b(savings|car fund|current)\b/.test(t)) {
    return { text: 'I can’t send money to other people from this chat. You can pay them in the app under Payments.\n\nI can help with moves between your own accounts, like putting a bit more into savings.', suggestions: ['Plan my next payday'], usedEntryIds: [], topic: 'other' };
  }
  if (/\b(cancel|stop)\b[^.?!]{0,30}\b(transfer|plan|saving|monthly)\b/.test(t)) {
    return { text: 'You can stop a monthly saving plan any time in Payday autopilot. Nothing moves from this chat without your tap.', suggestions: [], usedEntryIds: [], topic: 'saving_plan' };
  }
  const moveAmt = amountIn(text);
  if (/\b(move|transfer|put|add|set up)\b/.test(t) && moveAmt && /\b(savings?|car|fund|flat|goal|current|account)\b/.test(t)) {
    const clarify = transferClarification(text, before);
    if (clarify) return { text: 'I haven’t prepared a transfer. Should I explain how it would work, or help you prepare one?', suggestions: [], usedEntryIds: [], topic: 'saving_plan' };
    const dest = transferTarget(text, before);
    const once = transferIsOnce(text, before);
    if (dest === 'unsupported') return { text: 'From this chat I can only move money from your current account to your savings or your car fund. For other moves, use Transfers in the app.', suggestions: [], usedEntryIds: [], topic: 'saving_plan' };
    if (dest === 'carFund' && !once) return { text: 'A monthly transfer can only go to savings from this chat. I can move money to your car fund once, now, or you can set up a regular one under Transfers in the app.', suggestions: [`Move ${Math.round(moveAmt)} € to the car fund now`], usedEntryIds: [], topic: 'saving_plan' };
    return { text: 'Here it is. Nothing moves until you confirm 👇', suggestions: [], usedEntryIds: [], topic: 'saving_plan', actions: [{ name: 'offerTransfer', args: { amountPerMonth: Math.round(moveAmt), once } }] };
  }

  // v31: loans, investing and products: an adviser, not a guess.
  if (/\b(loan|mortgage|borrow|credit)\b/.test(t)) {
    return { text: 'A Nordea adviser can look at that with you, free. Here’s what they would see, once, if you connect:', suggestions: [], usedEntryIds: [], topic: 'person', actions: [{ name: 'startHandoff', args: { agentId: 'adviser' } }] };
  }
  if (/\b(invest\w*|shares?|stocks?|crypto|bitcoin|etf|equity|interest|euribor|insurance)\b|(?<!car\s)\bfunds?\b/.test(t) || /\b(is there|do you have|can i (get|open)|open|which)\b[^.?!]{0,30}\baccounts?\b/.test(t)) {
    return { text: 'I can’t give investment or product advice, or live rates, here. A Nordea adviser can go through your options with you, free.', suggestions: ['Talk to a person', 'Am I on track?'], usedEntryIds: [], topic: 'investing' };
  }

  // v31: another customer's money is never shown.
  const others = Object.values(db.getState().users).filter((x) => x.id !== userId).map((x) => String(x.name || '').split(/\s+/)[0].toLowerCase()).filter((n) => n.length >= 3);
  if (others.some((n) => new RegExp(`\\b${n}(['’]?s)?\\b`).test(t)) || /\banother customer|other customers?\b|someone else['’]?s\b/.test(t)) {
    return { text: 'I can only show your own accounts.', suggestions: ['How much is in my accounts?'], usedEntryIds: [], topic: 'other' };
  }

  // Looking for a flat / apartment / home (e.g. in Espoo): the partner offer card, if offers are on.
  if (/\b(flat|apartment|apartments|flats|home|house|asunto)\b/.test(t) && /\b(look|looking|search|find|buy|buying|for sale|view|espoo|helsinki|vantaa)/.test(t)) {
    const home = goals.find((g) => g.goalType === 'home');
    const st = home ? fin.goalStatus(userId, home) : null;
    const where = (t.match(/\b(espoo|helsinki|vantaa|tampere|turku)\b/) || [])[1];
    const place = where ? where[0].toUpperCase() + where.slice(1) : 'the area';
    const lines = [
      `Exciting! Flats in ${place} 🏡`,
      st&&st.saved!==undefined&&st.monthlyGoingIn!==undefined&&st.projectedByTargetDate!==undefined ? `For “${st.title}” you have ${eur(st.saved)} of ${eur(st.target)} saved. At ${eur(st.monthlyGoingIn)} a month you’d have about ${eur(st.projectedByTargetDate)} by ${month(st.targetDate)}.` : '',
      'If you’d like, a Nordea home loan adviser can look at it with you.',
    ].filter(Boolean);
    return {
      text: lines.join('\n\n'),
      suggestions: ['How much can I borrow?', 'Am I on track?', 'Talk to a person'],
      usedEntryIds: home ? [home.id] : [],
      topic: 'home_buying',
      // v28: the homes card (if the words are about looking for a home) is decided by code before this answer.
      actions: [],
    };
  }

  // v28: the customer tapped "Yes, move 300 € a month": now the transfer card (nothing moves until confirmed).
  const mv = t.match(/\b(?:yes,?\s*)?move\s+(\d[\d\s]*)\s*€?\s*(?:a|per|each)\s+(?:month|payday)/);
  if (mv) {
    const amount = Number(mv[1].replace(/\s/g, ''));
    if (amount > 0) return { text: 'Here it is. Nothing moves until you confirm 👇', suggestions: [], usedEntryIds: [], topic: 'saving_plan', actions: [{ name: 'offerTransfer', args: { amountPerMonth: amount } }] };
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

  // v31: goal changes need the AI; the customer can do it themselves meanwhile.
  if (/\b(forget|remove|delete|drop|change|update|edit|cancel)\b[^.?!]{0,30}\bgoal\b/.test(t)) {
    return { text: 'I can’t change goals right now. You can edit or remove it yourself in Nora knows, or ask me again in a moment.', suggestions: ['Am I on track?'], usedEntryIds: [], topic: 'goals' };
  }

  // Goals: on track?
  if (/\b(on track|track|goal|goals|deposit|progress|saving for|behind)\b/.test(t)) {
    if (!goals.length) return { text: 'You don’t have a goal with an amount and a date yet. Tell me what you’re saving for and by when, and I’ll track it with you.', suggestions: ['Help me set a savings goal'], usedEntryIds: [], topic: 'goals' };
    const parts = goals.slice(0, 3).map((g) => {
      const s = fin.goalStatus(userId, g);
      if(s.saved===undefined||s.monthlyGoingIn===undefined||s.projectedByTargetDate===undefined||s.shortBy===undefined||s.extraPerMonthNeeded===undefined)return `"${s.title}": target ${eur(s.target)} by ${month(s.targetDate)}. Saved balance or monthly contribution is not linked, so progress and forecast are unknown, not zero.`;
      return s.onTrack
        ? `“${s.title}”: ${eur(s.saved)} of ${eur(s.target)}. You’re on track for ${month(s.targetDate)} 🎉`
        : !(s.saved > 0) && !(s.monthlyGoingIn > 0)
          ? `“${s.title}”: ${eur(s.target)} by ${month(s.targetDate)}. Nothing on your accounts is set aside for it yet; about ${eur(s.extraPerMonthNeeded)} a month would get you there.`
          : `“${s.title}”: ${eur(s.saved)} of ${eur(s.target)}. At ${eur(s.monthlyGoingIn)} a month you’d have about ${eur(s.projectedByTargetDate)} by ${month(s.targetDate)}, so about ${eur(s.shortBy)} short. About ${eur(s.extraPerMonthNeeded)} more a month would get you there.`;
    });
    const plan = fin.payPlan(userId);
    const first = fin.goalStatus(userId, goals[0]);
    const offer = first.onTrack===false && plan.suggestedExtraMove > 0;
    return {
      // v28: a question asks for an answer, not a card: the transfer is offered as a quick reply the customer can tap.
      text: parts.join('\n\n') + (offer ? `\n\nWant to move ${eur(plan.suggestedExtraMove)} more each payday?` : ''),
      suggestions: offer ? [`Yes, move ${plan.suggestedExtraMove} € a month`, 'Plan my next payday'] : ['Plan my next payday', 'Where does my money go?'],
      usedEntryIds: goals.slice(0, 3).map((g) => g.id),
      topic: 'goals',
      actions: [],
    };
  }

  // Spending.
  if (/\b(spend|spent|spending|money go|where does|budget|expenses?|costs|eating out|restaurants|groceries|food|rent)\b|\bdid (i|we) pay\b/.test(t)) {
    const sp = fin.spending(userId, 3) as { averagePerMonthByCategory: Record<string, number>; averagePerMonthTotal: number; thisMonthSoFarTotal: number };
    if (!(sp.averagePerMonthTotal > 0) && !(sp.thisMonthSoFarTotal > 0)) return { text: 'I can’t see any spending on your accounts yet. Once payments come in, I can show you where your money goes.', suggestions: ['How much is in my accounts?'], usedEntryIds: [], topic: 'spending' };
    const top = Object.entries(sp.averagePerMonthByCategory).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      text: `Over the last 3 months about ${eur(sp.averagePerMonthTotal)} a month went out:\n\n${top.map(([k, v]) => `• ${CAT[k] || k}: ${eur(v)}`).join('\n')}\n\nThis month so far: ${eur(sp.thisMonthSoFarTotal)}.`,
      suggestions: ['Plan my next payday', 'Am I on track?'],
      usedEntryIds: [],
      topic: 'spending',
    };
  }

  // Salary / payday.
  if (/\b(salary|paid|payday|income|pension|raise|wages?)\b|\bmy pay\b|\bpay ?check\b/.test(t)) {
    const s = fin.salaryInfo(userId);
    const p = fin.payPlan(userId);
    if (!s.found) return { text: 'I can’t see a salary or pension coming in yet.', suggestions: pills, usedEntryIds: [], topic: 'income' };
    return {
      text: [
        `Your latest ${/pension/i.test(`${t} ${u.roleDescription || ''}`) ? 'pension' : 'pay'} was ${eur(s.latest)}, on the ${ordinal(s.payday)} of the month.${s.changed && s.difference > 0 ? ` That’s ${eur(s.difference)} more than before ${month(`${s.changeMonth}-01`)}.` : ''}`,
        `After about ${eur(p.spendingAveragePerMonth)} of spending and ${eur(p.alreadySavingPerMonth)} of saving, about ${eur(p.leftOver)} is left each month.${p.towardsGoal && p.suggestedExtraMove > 0 ? ` I’d suggest moving ${eur(p.suggestedExtraMove)} more to “${p.towardsGoal}”.` : ''}`,
      ].join('\n\n'),
      suggestions: ['Plan my next payday', 'Am I on track?'],
      usedEntryIds: main ? [main.id] : [],
      topic: 'income',
    };
  }

  // Balance.
  if (/\b(balance|blnce|bal|how much (do i have|money|is in)|accounts?|savings|rahaa|saldo|pengar)\b/.test(t)) {
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
  // Only a plain thank-you ("thanks, and can I give my grandkids money?" is a question, not a thank-you).
  if (/\b(thanks|thank you|kiitos)\b/.test(t) && !/\?/.test(t) && t.length <= 40) return { text: 'You’re welcome! 💙', suggestions: [], usedEntryIds: [], topic: 'small_talk' };

  if (/\b(bye|goodbye|see you|that['’]?s all|nothing else)\b/.test(t)) return { text: 'Bye for now! I’m here whenever you need me.', suggestions: [], usedEntryIds: [], topic: 'small_talk' };
  if (/^\s*(ok|okay|k|cool|great|fine|alright|nice|good)\W*$/.test(t)) return { text: '👍 Anything else I can help with?', suggestions: pills, usedEntryIds: [], topic: 'small_talk' };

  // Greetings.
  if (/^\s*(hi|hey|hello|moi|hei|terve|good (morning|evening|day))\b/.test(t)) {
    return { text: `Hi ${u.name}! What would you like to look at?`, suggestions: pills, usedEntryIds: [], topic: 'small_talk' };
  }

  // Anything else: honest and short, with options.
  return {
    text: reason === 'unclear'
      ? 'Sorry, I didn’t get that right. Could you say it another way? I can also help straight away with your goals, your spending, your pay or whether something is affordable.'
      : 'Sorry, I can’t answer that one right now. I can still help straight away with your goals, your spending, your pay and whether something is affordable.',
    suggestions: pills,
    usedEntryIds: [],
    topic: 'other',
  };
}

export type { MessageCard };
