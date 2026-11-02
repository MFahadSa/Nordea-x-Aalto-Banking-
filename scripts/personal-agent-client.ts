/**
 * SIMULATED external personal-agent client - a separate local process that talks to the
 * banking app over real HTTP, exactly the shape a smart-glasses-style agent (e.g. a Meta
 * Muse class device) would use. There is NO live external connection: this process runs
 * on the same machine and calls the local server.
 *
 * What is genuinely demonstrated here:
 *  - transport: the client reaches the agents only through POST /api/arch/:uid/agent-query
 *    (explicit query/reply messages on the bus), never by reading a database;
 *  - answer composition: the FINAL ANSWER IS COMPOSED HERE, in the client, from the CM and
 *    Nordea agents' message replies. The server supplies facts; this process writes the words.
 *
 * Usage: npx tsx scripts/personal-agent-client.ts [--uid lauri] [--server http://localhost:3000]
 */
import readline from 'readline';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const SERVER = opt('server', 'http://localhost:3000');
const UID = opt('uid', 'lauri');

interface CmReply { from: 'cm-db'; matchedEntries: { id: string; title: string; detail: string; status: string; evidence: { total?: number; note?: string } | null }[] }
interface NordeaReply { from: 'nordea-db'; matchCount: number; totalAbsEur: number; categories: string[] } // F9: aggregates only, no raw transactions

async function ask(to: 'cm' | 'nordea', question: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${SERVER}/api/arch/${UID}/agent-query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to, question }),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { reply: Record<string, unknown> }).reply;
}

/** The client's own wording, built only from the two agents' reply messages. */
export function compose(question: string, cm: CmReply | null, nordea: NordeaReply | null): string {
  const parts: string[] = [];
  if (cm && cm.matchedEntries.length) {
    const active = cm.matchedEntries.filter((e) => e.status === 'active');
    const stale = cm.matchedEntries.filter((e) => e.status !== 'active');
    if (active.length) {
      parts.push(`From your shared context cabinet: ${active.map((e) => {
        const ev = e.evidence?.total != null ? ` (evidence: EUR ${e.evidence.total})` : '';
        return `${e.title} - ${e.detail}${ev}`;
      }).join('; ')}.`);
    }
    if (stale.length) parts.push(`Note: ${stale.length} cabinet entr${stale.length === 1 ? 'y is' : 'ies are'} flagged stale - the underlying bank data changed, re-review them in merge review.`);
  }
  if (nordea && nordea.matchCount > 0) {
    parts.push(`From the Nordea agent (aggregate only): ${nordea.matchCount} matching transaction${nordea.matchCount === 1 ? '' : 's'} totalling EUR ${nordea.totalAbsEur} across ${nordea.categories.join(', ')}.`);
  }
  if (!parts.length) {
    return `Neither the Context Memory agent nor the Nordea agent had anything on "${question}". I only know what their replies carry - I never read their databases myself.`;
  }
  return parts.join(' ');
}

async function main() {
  console.log('Personal-agent client (SIMULATED external agent: separate local process, real HTTP, no live connection).');
  console.log(`Server: ${SERVER}  user: ${UID}. The final answer is composed in THIS process from agent message replies. Type "exit" to quit.`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '\nyou> ' });
  rl.prompt();
  for await (const line of rl) {
    const question = line.trim();
    if (!question || question === 'exit') break;
    const [cm, nordea] = await Promise.all([ask('cm', question), ask('nordea', question)]);
    if (cm === null && nordea === null) {
      console.log('client> Could not reach the agents - is the server running and are the agents on?');
    } else {
      console.log(`client> ${compose(question, cm as CmReply | null, nordea as NordeaReply | null)}`);
    }
    rl.prompt();
  }
  rl.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
