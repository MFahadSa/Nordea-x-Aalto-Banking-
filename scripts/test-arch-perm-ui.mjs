/**
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

function baseState(level = 'all', mode = 'Review everything') {
  return {
    sessionId: null,
    agents: { personal: { name: 'Abel', off: false }, cm: { off: false }, nordea: { off: false } },
    stores: { user: {}, cm: {}, nordea: {} },
    databases: {
      user: { goals: 0, personalFacts: 0 },
      contextMemory: { entries: 0, parked: false, permissions: { reviewLevel: level, userCardMode: mode } },
      nordea: null,
    },
    goals: [], context: null, contextMd: null, llm: null, round: null, ai: null,
    contextCards: { memory: [], nordea: [] }, queues: { airlock: [], review: [] }, messages: [],
  };
}

function makePage(scriptSource) {
  const elements = new Map();
  const el = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id, value: '', innerHTML: '', textContent: '', disabled: false, className: '', style: {},
        files: [], onclick: null, onchange: null, listeners: {}, scrollTop: 0,
        addEventListener(ev, fn) { (this.listeners[ev] ??= []).push(fn); },
        async click() { if (this.onclick) await this.onclick(); },
        appendChild() {},
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
      createElement: () => ({ style: {}, className: '', textContent: '', appendChild() {} }),
    },
    fetch: (url, opts) => new Promise((resolve) => { pending.push({ url: String(url), opts, resolve }); }),
  };
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

// ---------- REPRO on the pre-fix script (pinned commit 914c200) ----------
let oldScript = null;
try { oldScript = extractScript(execSync('git show 914c200:public/arch.html', { encoding: 'utf-8' })); } catch { /* not in a git checkout */ }
if (oldScript) {
  const page = makePage(oldScript);
  await boot(page);
  page.el('perm').value = 'high'; // user picks "only high risk waits", does not click Save
  page.tick();
  page.respond(await page.waitReq('/state'), baseState('all'));
  await flush();
  check('REPRO old: 5s poll wipes the unsaved choice back to "all"', page.el('perm').value === 'all', page.el('perm').value);

  const page2 = makePage(oldScript);
  await boot(page2);
  page2.context.refresh(); // an earlier read (e.g. a tick) still in flight...
  const stale = await page2.waitReq('/state');
  page2.context.refresh(); // ...and a newer read (e.g. right after Save)
  const fresh = await page2.waitReq('/state', 'GET', 1);
  page2.respond(fresh, baseState('high'));
  await flush();
  page2.respond(stale, baseState('all')); // the older response lands last
  await flush();
  check('REPRO old: out-of-order stale response repaints the old value', page2.el('perm').value === 'all', page2.el('perm').value);
} else {
  console.log('SKIP  REPRO (git show 914c200 unavailable)');
}

// ---------- FIX on the working-tree script ----------
const newScript = extractScript(fs.readFileSync('public/arch.html', 'utf-8'));

{
  const page = makePage(newScript);
  await boot(page);
  await change(page, 'perm', 'high'); // unsaved choice
  page.tick();
  page.respond(await page.waitReq('/state'), baseState('all')); // server still has the old value
  await flush();
  check('FIX: poll keeps the unsaved "high" choice', page.el('perm').value === 'high', page.el('perm').value);
  check('FIX: unsaved state is visible', /Unsaved/.test(page.el('perm-status').textContent), page.el('perm-status').textContent);
}

{
  const page = makePage(newScript);
  await boot(page);
  await change(page, 'perm', 'high');
  const save = page.el('btn-perm').click(); // do not await yet; drive the requests
  await flush();
  const post = await page.waitReq('/permissions', 'POST');
  const sent = JSON.parse(post.opts.body);
  check('FIX: Save POSTs the chosen values', sent.reviewLevel === 'high' && sent.userCardMode === 'Review everything', sent);
  check('FIX: saving state is visible and the button is disabled', page.el('btn-perm').disabled && /Saving/.test(page.el('perm-status').textContent));
  page.respond(post, { reviewLevel: 'high', userCardMode: 'Review everything' });
  await flush();
  page.respond(await page.waitReq('/state'), baseState('high')); // fresh read confirms persistence
  await save; await flush();
  check('FIX: dirty clears and "Saved." shows after persisted confirmation', page.el('perm-status').textContent === 'Saved.', page.el('perm-status').textContent);
  check('FIX: select shows the persisted value', page.el('perm').value === 'high');
  page.tick(); // later polls keep the confirmed value
  page.respond(await page.waitReq('/state'), baseState('high'));
  await flush();
  check('FIX: later poll does not disturb the saved selection', page.el('perm').value === 'high');
}

{
  // Save while an earlier read is still in flight: the late stale response must not repaint.
  const page = makePage(newScript);
  await boot(page);
  page.tick(); // an in-flight tick read (pre-save data)
  const staleTick = await page.waitReq('/state');
  await change(page, 'perm', 'high');
  const save = page.el('btn-perm').click();
  await flush();
  page.respond(await page.waitReq('/permissions', 'POST'), { reviewLevel: 'high', userCardMode: 'Review everything' });
  await flush();
  page.respond(await page.waitReq('/state', 'GET', 1), baseState('high')); // the post-save read confirms (2nd state read)
  await save; await flush();
  page.respond(staleTick, baseState('all')); // NOW the stale tick response lands
  await flush();
  check('FIX: stale pre-save response cannot repaint the old value', page.el('perm').value === 'high', page.el('perm').value);
  check('FIX: saved state survives the stale response', page.el('perm-status').textContent === 'Saved.', page.el('perm-status').textContent);
}

{
  // POST succeeds but the fresh read still shows old values: dirty must NOT clear.
  const page = makePage(newScript);
  await boot(page);
  await change(page, 'perm', 'high');
  const save = page.el('btn-perm').click();
  await flush();
  page.respond(await page.waitReq('/permissions', 'POST'), { reviewLevel: 'high', userCardMode: 'Review everything' });
  await flush();
  page.respond(await page.waitReq('/state'), baseState('all')); // not yet persisted
  await save; await flush();
  check('FIX: no persisted confirmation -> choice kept, dirty stays', page.el('perm').value === 'high' && /still shows the old setting/.test(page.el('perm-status').textContent), page.el('perm-status').textContent);
  page.tick(); // once the server catches up, a poll confirms and clears dirty
  page.respond(await page.waitReq('/state'), baseState('high'));
  await flush();
  check('FIX: later matching read clears dirty silently', page.el('perm-status').textContent === '' && page.el('perm').value === 'high', page.el('perm-status').textContent);
}

{
  // POST fails: choice kept, visible error.
  const page = makePage(newScript);
  await boot(page);
  await change(page, 'perm', 'high');
  const save = page.el('btn-perm').click();
  await flush();
  page.respond(await page.waitReq('/permissions', 'POST'), { error: 'boom' }, false);
  await save; await flush();
  check('FIX: failed save keeps the choice and shows an error', page.el('perm').value === 'high' && /Save failed/.test(page.el('perm-status').textContent), page.el('perm-status').textContent);
}

{
  // Out-of-order guard without any dirty state: the newest read wins.
  const page = makePage(newScript);
  await boot(page);
  page.context.refresh();
  const older = await page.waitReq('/state');
  page.context.refresh();
  const newer = await page.waitReq('/state', 'GET', 1);
  page.respond(newer, baseState('all'));
  await flush();
  page.respond(older, baseState('high')); // older response arrives last
  await flush();
  check('FIX: newest response wins when reads race', page.el('perm').value === 'all', page.el('perm').value);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
