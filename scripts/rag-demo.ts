/**
 * Local retrieval demonstrator for the three-database architecture.
 *
 * Precise labels (do not inflate):
 *  - Retrieval: TF-IDF (term frequency x inverse document frequency) computed in this file.
 *    No embeddings, no vector DB, no external model, no LLM anywhere.
 *  - Isolation, modeled exactly: there is NO shared retrieval index. The personal agent
 *    builds its own TF-IDF index over its OWN store (the User DB) only. Cabinet content
 *    reaches it ONLY as an explicit message reply: agentQuery() posts a query on the bus,
 *    the Context Memory agent ranks its own store separately and answers with entries.
 *    This demonstrator never opens the Nordea database.
 *  - Composition: deterministic template over what the personal agent legitimately holds
 *    (its own retrieved docs + the CM agent's reply payload).
 *
 * Usage: npx tsx scripts/rag-demo.ts --uid lauri "what do you know about my car saving?"
 */
import { pathToFileURL } from 'node:url';
import { loadUserDb } from '../src/server/arch/store/userStore.js';
import { agentQuery } from '../src/server/arch/orchestrator.js';

const args = process.argv.slice(2);
const uid = (() => { const i = args.indexOf('--uid'); return i >= 0 ? args[i + 1] : 'lauri'; })();
const question = args.filter((a, i) => a !== '--uid' && args[i - 1] !== '--uid').join(' ').trim();

export interface Doc { source: string; text: string }
const STOP = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'what', 'from', 'your', 'you', 'have', 'about', 'are', 'was', 'were', 'will', 'would', 'should', 'could', 'all', 'any', 'how', 'when', 'where', 'why', 'who']);
const terms = (s: string) => s.toLowerCase().split(/[^a-z0-9€]+/).filter((w) => w.length >= 3 && !STOP.has(w));

// Real TF-IDF: tf = count in doc / doc length; idf = ln(1 + N / df). One index per caller's own corpus.
export function tfidfRank(query: string, docs: Doc[]): { doc: Doc; score: number }[] {
  const q = terms(query);
  const N = docs.length || 1;
  const df = new Map<string, number>();
  for (const d of docs) {
    for (const t of new Set(terms(d.text))) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return docs
    .map((d) => {
      const dt = terms(d.text);
      let score = 0;
      for (const t of q) {
        const tf = dt.filter((w) => w === t).length / Math.max(dt.length, 1);
        const idf = Math.log(1 + N / (1 + (df.get(t) ?? 0)));
        score += tf * idf;
      }
      return { doc: d, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** The personal agent's own retrieval index: User DB documents ONLY. */
export function buildOwnDocs(uid: string): Doc[] {
  const u = loadUserDb(uid);
  return [
    ...u.goals.map((g) => ({ source: 'user-db:goal', text: `${g.title} ${g.detail}` })),
    ...u.personalFacts.map((f) => ({ source: `user-db:fact(${f.source})`, text: f.text })),
  ];
}

function main() {
  if (!question) { console.error('Give a question.'); process.exit(1); }
  console.log('Local RAG demonstrator - per-agent TF-IDF indexes, explicit message replies, deterministic composition. NO shared index, NO embeddings, NO LLM.');
  console.log(`Question: ${question}`);

  // 1. The personal agent retrieves from its OWN store.
  const ownRanked = tfidfRank(question, buildOwnDocs(uid));

  // 2. It asks the Context Memory agent by message; the CM agent answers from its own DB.
  const cmReply = agentQuery(uid, 'cm', question).reply as { matchedEntries: { title: string; detail: string; status: string; evidence: { total?: number } | null }[] };
  const replyDocs: Doc[] = cmReply.matchedEntries
    .filter((e) => e.status === 'active')
    .map((e) => ({ source: 'cm-agent-reply:entry', text: `${e.title} ${e.detail}${e.evidence?.total != null ? ` evidence total EUR ${e.evidence.total}` : ''}` }));

  // 3. The personal agent ranks and composes over only what it legitimately holds.
  const ranked = [...ownRanked, ...tfidfRank(question, replyDocs)].sort((a, b) => b.score - a.score).slice(0, 3);
  console.log(`Own-store hits: ${ownRanked.length}; CM agent reply entries: ${replyDocs.length}.`);
  if (!ranked.length) {
    console.log('Answer: nothing relevant is stored or returned, so I will not invent one. (Thin context, said honestly.)');
  } else {
    console.log('Retrieved (ranked by TF-IDF):');
    for (const r of ranked) console.log(`  [${r.score.toFixed(4)}] ${r.doc.source}: ${r.doc.text.slice(0, 100)}`);
    console.log(`Answer: ${ranked.map((r) => r.doc.text).join(' | ')}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
