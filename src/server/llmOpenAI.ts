// Abel on any OpenAI-compatible chat API, e.g. the Aalto LLM gateway (only reachable on the Aalto VPN).
// Turn it on with LLM_PROVIDER=openai plus LLM_BASE_URL, LLM_API_KEY and LLM_MODEL (in .env on the laptop,
// never in code). Gemini stays the default everywhere else.
import { LlmProvider, ToolDecl, Turn, ToolCall, withTimeout } from './llm.js';

const base = () => (process.env.LLM_BASE_URL || 'https://llm-gateway.k8s.aalto.fi/api/v1').replace(/\/+$/, '');
const model = () => process.env.LLM_MODEL || 'Qwen/Qwen3.8-27B-FP8';
const key = () => process.env.LLM_API_KEY || '';
/** Shared university GPUs can be slow, and some models need minutes to start. */
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 60000;

let lastOk: { at: string; model: string } | null = null;
let lastError: { at: string; message: string; model?: string } | null = null;
// Some servers reject parts of the request; remember what they accepted so we don't ask twice.
let toolChoice: 'required' | 'auto' = 'required';
let noThink = true;

function clean(err: any) {
  const raw = String(err?.message || err || 'unknown error');
  return raw.replace(/Bearer\s+\S+/gi, 'Bearer [key]').replace(/sk-[0-9A-Za-z_-]{10,}/g, '[key]').slice(0, 300);
}

/** Our turns → OpenAI chat messages. Tool calls need ids; the model's ids are kept, missing ones are made up. */
function toMessages(system: string, turns: Turn[]) {
  const msgs: any[] = [{ role: 'system', content: system }];
  let n = 0;
  const ids = new Map<ToolCall, string>();
  const idOf = (c: ToolCall) => {
    if (c.id) return c.id;
    if (!ids.has(c)) ids.set(c, `call_${n++}`);
    return ids.get(c)!;
  };
  for (const t of turns) {
    if (t.role === 'user') {
      const files = t.files || [];
      if (!files.length) msgs.push({ role: 'user', content: t.text });
      else
        msgs.push({
          role: 'user',
          content: [
            ...files.filter((f) => f.mimeType.startsWith('image/')).map((f) => ({ type: 'image_url', image_url: { url: `data:${f.mimeType};base64,${f.data}` } })),
            { type: 'text', text: t.text },
          ],
        });
    } else if (t.role === 'model') msgs.push({ role: 'assistant', content: t.text });
    else if (t.role === 'model_calls')
      msgs.push({
        role: 'assistant',
        content: null,
        tool_calls: t.calls.map((c) => ({ id: idOf(c), type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } })),
      });
    else for (const r of t.results) msgs.push({ role: 'tool', tool_call_id: idOf(r.call), content: JSON.stringify(r.result ?? null) });
  }
  return msgs;
}

/** Qwen and similar models may write their thinking into the answer. */
const stripThinking = (s: string) => s.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '').trim();

function parseArgs(s: unknown): Record<string, any> {
  if (s && typeof s === 'object') return s as any;
  try {
    return JSON.parse(String(s || '{}'));
  } catch {
    // Some models wrap JSON in text or code fences.
    const m = String(s).match(/\{[\s\S]*\}/);
    try { return m ? JSON.parse(m[0]) : {}; } catch { return {}; }
  }
}

async function post(body: any, timeoutMs: number) {
  const res = await withTimeout(
    fetch(`${base()}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key()}` },
      body: JSON.stringify(body),
    }),
    timeoutMs,
    'The Aalto LLM',
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function chat(args: { system: string; turns: Turn[]; tools: ToolDecl[]; temperature?: number; timeoutMs?: number }) {
  const body: any = { model: model(), messages: toMessages(args.system, args.turns), temperature: args.temperature ?? 0.3 };
  if (args.tools.length) {
    body.tools = args.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  }
  const timeout = Math.max(args.timeoutMs || 0, TIMEOUT_MS);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (args.tools.length) body.tool_choice = toolChoice;
    if (noThink) body.chat_template_kwargs = { enable_thinking: false }; // vLLM + Qwen: answer without a long think
    else delete body.chat_template_kwargs;
    try {
      const out = await post(body, timeout);
      lastOk = { at: new Date().toISOString(), model: model() };
      return out;
    } catch (err) {
      const msg = clean(err);
      lastError = { at: new Date().toISOString(), message: msg, model: model() };
      console.error(`Aalto LLM error (${model()}):`, msg);
      // Not every server accepts these extras. Drop them and try again.
      if (/^4\d\d/.test(msg) && noThink && /chat_template|enable_thinking|extra|unrecognized|not permitted/i.test(msg)) { noThink = false; continue; }
      if (/^4\d\d/.test(msg) && toolChoice === 'required' && /tool_choice|required/i.test(msg)) { toolChoice = 'auto'; continue; }
      throw err;
    }
  }
  throw new Error(lastError?.message || 'The Aalto LLM did not answer');
}

export const openAiProvider: LlmProvider = {
  name: 'aalto',
  isConfigured: () => !!key(),
  status: () => openAiStatus(),
  ping: () => openAiPing(),
  async step(args) {
    const out = await chat(args);
    const msg = out?.choices?.[0]?.message || {};
    const calls: ToolCall[] = (msg.tool_calls || []).map((c: any) => ({ id: c.id, name: c.function?.name || '', args: parseArgs(c.function?.arguments) }));
    return { calls, text: stripThinking(String(msg.content || '')) };
  },
};

export function openAiStatus() {
  return {
    provider: 'aalto',
    keyPresent: !!key(),
    model: model(),
    candidates: [model()],
    lastOk,
    lastError,
    thinking: noThink ? 'off' : 'model default',
    baseUrl: base(),
  };
}

export async function openAiPing() {
  if (!key()) return { ok: false, error: 'No LLM_API_KEY reaches the server (add it to the .env file).' };
  const t0 = Date.now();
  try {
    const out = await chat({ system: 'Reply with the single word OK.', turns: [{ role: 'user', text: 'Ping' }], tools: [], temperature: 0 });
    return { ok: true, model: model(), ms: Date.now() - t0, reply: stripThinking(String(out?.choices?.[0]?.message?.content || '')).slice(0, 40) };
  } catch (err) {
    const m = clean(err);
    return { ok: false, model: model(), ms: Date.now() - t0, error: /fetch failed|ENOTFOUND|ECONN|getaddrinfo/i.test(m) ? `Can’t reach ${base()}. Is the Aalto VPN on? (${m})` : m };
  }
}
