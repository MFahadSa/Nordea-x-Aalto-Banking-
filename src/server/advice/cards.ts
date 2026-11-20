/**
 * v26: the two recommender cards, built by code only. The AI never writes what is on them:
 * the question, the numbers, the reasons, the source and "what Nordea earns" all come from the
 * rule file and the customer's facts.
 */
import type { MessageCard } from '../../types.js';
import { FACTS, type Facts, type FactKey } from './facts.js';
import type { Candidate } from './guard.js';
import type { Rule } from './rules.js';

const KIND: Record<Rule['kind'], string> = { product: 'Nordea product', tax: 'Tax rule', state: 'State benefit' };

function sourceLabel(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, '');
  return host === 'vero.fi' ? 'Finnish Tax Administration'
    : host === 'kela.fi' ? 'Kela'
    : host === 'finanssivalvonta.fi' ? 'Financial Supervisory Authority'
    : host === 'nordea.fi' ? 'Nordea terms'
    : host;
}

const day = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  return `${dd} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].at(m - 1)} ${y}`;
};

function valueWords(k: FactKey, v: unknown): string {
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (FACTS[k].type === 'date' && typeof v === 'string') return day(v);
  if (k === 'psBalance' && typeof v === 'number') return `${Math.round(v).toLocaleString('fi-FI').replace(/ /g, ' ')} €`;
  if (k === 'incomeType') return ({ salary: 'salary', pension: 'pension', student_aid: 'student aid', none: 'none' } as Record<string, string>)[String(v)] ?? String(v);
  return String(v);
}

/** "Why you see this": every known fact the result depended on, with where it came from. */
export function reasons(used: FactKey[], facts: Facts): { text: string; from: string }[] {
  return used.filter((k) => facts[k].state === 'known').map((k) => ({ text: `${FACTS[k].label}: ${valueWords(k, facts[k].value)}`, from: facts[k].from }));
}

export function askCard(c: Candidate, calm: boolean): MessageCard {
  const fact = c.ask!.fact;
  return {
    type: 'ask_fact',
    title: 'One question',
    data: {
      ruleId: c.rule.id, version: c.rule.version, fact, factType: FACTS[fact].type,
      question: c.ask!.question, forTitle: c.rule.title, calm,
      note: `Asked for: ${c.rule.title}. Your answer is saved in What Abel knows, where you can change or delete it.`,
    },
  };
}

export function opportunityCard(c: Candidate, facts: Facts, calm: boolean): MessageCard {
  const r = c.rule;
  return {
    type: 'opportunity',
    title: r.title,
    data: {
      ruleId: r.id, version: r.version, kindLabel: KIND[r.kind], message: c.message,
      reasons: reasons(c.used, facts),
      source: { url: r.source.url, label: `${sourceLabel(r.source.url)} · checked ${day(r.source.checkedAt)}` },
      earns: /^nordea earns nothing/i.test(r.earns) ? r.earns : `What Nordea earns: ${r.earns.charAt(0).toLowerCase()}${r.earns.slice(1)}`,
      action: r.action, regulated: r.regulated, cta: r.cta, calm,
      ...(r.regulated ? { adviceNote: 'Advice on this comes from a person, not from Abel.' } : {}),
    },
  };
}

export function cardFor(c: Candidate, facts: Facts, calm: boolean): MessageCard {
  return c.status === 'ask' ? askCard(c, calm) : opportunityCard(c, facts, calm);
}
