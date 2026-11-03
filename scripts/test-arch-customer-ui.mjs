/**
 * D12 mock-DOM proof for public/arch.html customer switching (same harness as test-arch-perm-ui.mjs).
 * A rejected customer id must never leave another customer's panels on screen: panels clear at once,
 * a stale response from the previous customer never repaints, and the rejection is shown in the panel.
 * Mock-DOM proof for the standing-permission controls in public/arch.html.
 *
 * Runs the page's real inline <script> in a vm sandbox with a stub DOM and a fetch
 * mock whose responses the test controls (including out-of-order delivery). Proves:
 *  - REPRO (script pinned at 914c200, before the fix): the 5s tick wipes an unsaved
 *    choice and a late pre-save state read overwrites the UI after a save.
 *  - FIX (working tree): unsaved choices survive polls and stale responses; the
 *    dirty flag clears only when a fresh state read confirms the persisted values.
 * No server, no browser, no dependencies.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import { execSync } from 'node:child_process';

process.on('unhandledRejection', () => { /* the pre-fix page does not catch refresh errors; that is part of the repro */ });
let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail)}`); }
}
const flush = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

function extractScript(html) {
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if (!m) throw new Error('no inline script found');
  return m[1];
}

function baseState(level = 'all', mode = 'Review everything', goals = []) {
  return {
    sessionId: null,
    agents: { personal: { name: 'Abel', off: false }, cm: { off: false }, nordea: { off: false } },
    stores: { user: {}, cm: {}, nordea: {} },
    databases: {
      user: { goals: 0, personalFacts: 0 },
      contextMemory: { entries: 0, parked: false, permissions: { reviewLevel: level, userCardMode: mode } },
      nordea: null,
    },
    goals, context: null, contextMd: null, llm: null, round: null, ai: null,
    contextCards: { memory: [], nordea: [] }, queues: { airlock: [], review: [] }, messages: [],
  };
}

function makePage(scriptSource, extraSandbox = {}) {
  const elements = new Map();
  const el = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id, value: '', innerHTML: '', textContent: '', disabled: false, className: '', style: {},
        files: [], onclick: null, onchange: null, listeners: {}, scrollTop: 0, children: [],
        addEventListener(ev, fn) { (this.listeners[ev] ??= []).push(fn); },
        async click() { if (this.onclick) await this.onclick({ preventDefault() {} }); },
        appendChild(c) { this.children.push(c); },
      });
    }
    return elements.get(id);
  };
  const pending = [];
  const sandbox = {
    console, setTimeout, clearTimeout, Promise, JSON, Math, Date,
    setInterval: (fn) => { sandbox.__tick = fn; return 1; },
    performance: { now: () => 0 },
    location: { hash: '' },
    prompt: () => null, confirm: () => true,
    window: {},
    document: {
      hidden: false, activeElement: null,
      getElementById: el,
      createElement: () => ({ style: {}, className: '', textContent: '', href: '', onclick: null, children: [], appendChild(c) { this.children.push(c); }, async click() { if (this.onclick) await this.onclick({ preventDefault() {} }); } }),
    },
    fetch: (url, opts) => new Promise((resolve) => { pending.push({ url: String(url), opts, resolve }); }),
  };
  Object.assign(sandbox, extraSandbox);
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(scriptSource, context, { filename: 'arch.html#script' });
  el('uid').value = 'lauri';
  const req = (match, method, skip = 0) => pending.filter((r) => r.url.includes(match) && (method === undefined || ((r.opts?.method ?? 'GET') === method)))[skip];
  return {
    el, pending, context,
    tick: () => sandbox.__tick(),
    async waitReq(match, method, skip = 0, tries = 50) {
      for (let i = 0; i < tries; i++) { const r = req(match, method, skip); if (r) return r; await flush(2); }
      throw new Error(`no pending request matching ${match} (${method ?? 'any'}, skip ${skip})`);
    },
    respond(r, body, ok = true) {
      const i = pending.indexOf(r);
      if (i === -1) throw new Error('respond: request already settled');
      pending.splice(i, 1);
      r.resolve({ ok, status: ok ? 200 : 500, json: async () => body });
    },
  };
}

async function boot(page, level = 'all', mode = 'Review everything') {
  page.respond(await page.waitReq('/api/arch/customers'), { customers: ['lauri'] });
  await flush();
  page.respond(await page.waitReq('/state'), baseState(level, mode));
  await flush();
}
const change = async (page, id, value) => { const e = page.el(id); e.value = value; for (const fn of e.listeners.change ?? []) await fn(); };


function stateFor(name, goalTitle) {
  const s = baseState('all', 'Review everything', [{ id: `${name}-g`, title: goalTitle, detail: '' }]);
  s.agents.personal.name = name; s.databases.user.goals = 1;
  return s;
}
const customers = { customers: ['lauri', 'eeva'], rejected: ['te.st'], hydrateSkipped: { count: 1, ids: [{ store: 'user', id: 'x.y', rows: 3 }], hostedUnchanged: true } };
const switchTo = async (page, id) => { const e = page.el('uid'); e.value = id; for (const fn of e.listeners.change ?? []) await fn(); };
const run = async (script, label) => {
  const page = makePage(script);
  page.respond(await page.waitReq('/api/arch/customers'), customers); await flush();
  page.respond(await page.waitReq('/state'), stateFor('Lauri', 'LAURI-SECRET-GOAL')); await flush();
  check(`${label}: lauri panels painted`, page.el('user-goals').innerHTML.includes('LAURI-SECRET-GOAL'));
  check(`${label}: dropdown offers only canonical ids`, page.el('uid').innerHTML.includes('value="lauri"') && !page.el('uid').innerHTML.includes('te.st'));
  check(`${label}: unsupported ids are reported, not offered`, page.el('chatlog').children.some((c) => /te\.st/.test(c.textContent) && /unchanged/.test(c.textContent)));
  // an in-flight read for lauri, then the user lands on the rejected id
  page.tick(); const stale = await page.waitReq('/api/arch/lauri/state', undefined, 0);
  await switchTo(page, 'te.st');
  const loading = !page.el('user-goals').innerHTML.includes('LAURI-SECRET-GOAL') && !page.el('a-personal').innerHTML.includes('Lauri');
  check(`${label}: old customer's panels are gone as soon as another id is selected`, loading, page.el('user-goals').innerHTML);
  const rej = await page.waitReq('/api/arch/te.st/state');
  page.respond(stale, stateFor('Lauri', 'LAURI-SECRET-GOAL')); await flush();
  check(`${label}: a late response from the previous customer does not repaint`, !page.el('user-goals').innerHTML.includes('LAURI-SECRET-GOAL'));
  page.respond(rej, { error: 'Invalid customer id: use letters, digits, "_" or "-" only.', code: 'INVALID_CUSTOMER_ID' }, false); await flush(20);
  check(`${label}: the rejection is shown in the panel and no other customer's data is`, /Cannot show customer "te\.st"/.test(page.el('ctx-meta').textContent) && !page.el('user-goals').innerHTML.includes('LAURI') && page.el('user-summary').innerHTML === '', page.el('ctx-meta').textContent);
  await switchTo(page, 'eeva');
  page.respond(await page.waitReq('/api/arch/eeva/state'), stateFor('Eeva', 'EEVA-GOAL')); await flush(20);
  check(`${label}: a canonical customer paints normally after the error`, page.el('user-goals').innerHTML.includes('EEVA-GOAL') && !page.el('user-goals').innerHTML.includes('LAURI'));
};
let oldScript = null;
try { oldScript = extractScript(execSync('git show 5016b75:public/arch.html', { encoding: 'utf-8' })); } catch { /* not in a git checkout */ }
if (oldScript) { // REPRO of the reported defect against the previously pushed page
  const page = makePage(oldScript);
  page.respond(await page.waitReq('/api/arch/customers'), { customers: ['lauri', 'te.st'] }); await flush();
  page.respond(await page.waitReq('/state'), stateFor('Lauri', 'LAURI-SECRET-GOAL')); await flush();
  await switchTo(page, 'te.st');
  const rej = await page.waitReq('/api/arch/te.st/state');
  page.respond(rej, { error: 'Invalid customer id' }, false); await flush(20);
  check('REPRO @5016b75: rejected te.st leaves LAURI panels on screen (the reported defect)', page.el('user-goals').innerHTML.includes('LAURI-SECRET-GOAL'));
}
await run(extractScript(fs.readFileSync('public/arch.html', 'utf-8')), 'FIX');
console.log(`\ncustomer-ui: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
