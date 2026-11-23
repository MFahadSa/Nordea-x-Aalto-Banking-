// Duplicate and contradiction check, done in code (not by the model) before anything new is saved.
import { db } from './db.js';
import { CabinetEntry } from '../types.js';

const STOP = new Set(
  'the and for new our you are was but not all any can get got set one two out per off own too yes now its his her him she who how why may way day '.concat('with from that this about month months year years want have save saving for the and into your will would more less some plan plans really just like also been them they their there what when then than very january february march april june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec salary salaries pay net gross monthly account balance purchase preference minimum maintain fact goal goals job start starts starting ending end before after eur euro euros asked ask told tell said say says keep kept private note notes remember mention mentioned remind reminder thing things').split(' '),
);

export function words(s: string): Set<string> {
  return new Set((s.toLowerCase().match(/[a-zåäö]{3,}/g) || []).filter((w) => !STOP.has(w)).map((w) => w.replace(/s$/, '')));
}

export interface Candidate {
  type: string;
  title: string;
  detail?: string;
  goalType?: string;
  target?: { amount: number; date: string };
  /** v29: only a sensitive new item is compared with private notes (a rent reminder is never "like" a pregnancy). */
  sensitive?: boolean;
}

/** Exact purpose identity for goals, shared by proposal and transactional consume checks. */
export function equivalentGoalTitles(a:string,b:string):boolean{
 const purpose=(s:string)=>new Set([...words(s)].filter(w=>!['fund','pot','goal','target','deposit'].includes(w)).map(w=>['trip','travel','holiday','vacation'].includes(w)?'travel':w));
 const x=purpose(a),y=purpose(b);return x.size>0&&x.size===y.size&&[...x].every(w=>y.has(w));
}

/** The closest active thing Nora already knows that looks like the same thing, if any. */
export function findSimilarCandidates(userId: string, c: Candidate): CabinetEntry[] {
  // v29: the customer's own name (and the people around them, written in every detail) is not a shared topic.
  const names = new Set(words(String(db.getUser(userId)?.name || '')));
  const drop = (w: Set<string>) => new Set([...w].filter((x) => !names.has(x)));
  const mine = drop(words(`${c.title} ${c.detail || ''}`));
  const titleW = drop(words(c.title));
  const matches: { e: CabinetEntry; score: number }[] = [];
  for (const e of db.getCabinetEntries(userId)) {
    if (e.status === 'archived' || e.type === 'blind_spot') continue;
    if (e.private && !c.sensitive) continue;
    const theirs = drop(words(`${e.title} ${e.detail}`));
    const overlap = [...mine].filter((w) => theirs.has(w)).length;
    // One shared word counts only between the two names, not the details:
    // "Save for a wedding" is not the same as "Honeymoon (trip right after the wedding)".
    const theirTitle = drop(words(e.title));
    const titleHit = [...titleW].filter((w) => theirTitle.has(w)).length;
    // Kind alone does not establish identity. Compare purpose and target below.
    const sameGoalKind = c.type === 'goal' && e.type === 'goal' && !!c.goalType && ['home', 'car', 'buffer'].includes(c.goalType) && c.goalType === e.goalType;
    const genericGoal=new Set(['trip','travel','holiday','fund','pot','saving','savings','goal','deposit']);
    const distinctiveTitleHit=[...titleW].some(w=>!genericGoal.has(w)&&theirTitle.has(w));
    if(c.type==='goal'&&e.type==='goal') {
      const comparable=!!(sameGoalKind&&c.target&&e.target&&Math.abs(c.target.amount-e.target.amount)<=Math.max(1,e.target.amount*.1)&&c.target.date.slice(0,4)===e.target.date.slice(0,4));
      const kindTokens=(title:string)=>[...words(title)].filter(w=>!['new','buy','with','partner','home','flat','house','deposit','target','fund','pot','car','buffer','emergency'].includes(w));
      const genericSameKind=comparable&&kindTokens(c.title).length===0&&kindTokens(e.title).length===0;
      if(!distinctiveTitleHit&&!genericSameKind)continue;
      // A shared place is not shared purpose. Normalize ordinary purpose synonyms,
      // then require the same purpose tokens instead of discarding qualifiers.
      const purposeWords=(ws:Set<string>)=>new Set([...ws].filter(w=>!['fund','pot','goal','target','deposit'].includes(w)).map(w=>['trip','travel','holiday','vacation'].includes(w)?'travel':w));
      const a=purposeWords(titleW),b=purposeWords(theirTitle);
      if(!genericSameKind&&(a.size!==b.size||![...a].every(w=>b.has(w))))continue;
    }
    const ok = sameGoalKind || overlap >= 2 || (c.type === e.type && titleHit >= 1);
    if (!ok) continue;
    const score = overlap + titleHit + (sameGoalKind ? 3 : 0) + (c.type === e.type ? 1 : 0);
    matches.push({e,score});
  }
  return matches.sort((a,b)=>b.score-a.score).map(x=>x.e);
}

export function findSimilar(userId:string,c:Candidate):CabinetEntry|undefined{return findSimilarCandidates(userId,c)[0];}

/**
 * How a new candidate relates to the thing already known:
 * - conflict: both have an amount/date and they differ (e.g. 30 000 € vs 35 000 €)
 * - adds: the new one has an amount/date, the old one doesn't
 * - same: nothing new (every meaningful word is already there)
 * - different: similar, but not clearly the same, so the customer decides
 */
export function compare(existing: CabinetEntry, c: Candidate): 'conflict' | 'adds' | 'same' | 'different' {
  if (c.target && existing.target) {
    if (Math.abs(c.target.amount - existing.target.amount) > 1 || c.target.date.slice(0, 7) !== existing.target.date.slice(0, 7)) return 'conflict';
  } else if (c.target && !existing.target) return 'adds';
  const theirs = words(`${existing.title} ${existing.detail}`);
  const mine = [...words(c.title)];
  return mine.length && mine.every((w) => theirs.has(w)) ? 'same' : 'different';
}
