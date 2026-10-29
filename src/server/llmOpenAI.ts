// Abel on any OpenAI-compatible chat API: Groq's free tier (works in AI Studio) or the Aalto LLM gateway
// (only on the Aalto VPN). Settings come from LLM_PROVIDER=openai plus LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
// and optionally LLM_FALLBACK_MODELS (AI Studio → Settings → Secrets, or .env on a laptop; never in code).
// Each model is its own provider with its own state, so the chain in llmChain.ts can switch between them.
import { LlmProvider, ToolDecl, Turn, ToolCall, withTimeout } from './llm.js';
import { callsInText } from './replyParse.js';

export const envBase = () => (process.env.LLM_BASE_URL || 'https://llm-gateway.k8s.aalto.fi/api/v1').replace(/\/+$/, '');
export const envModel = () => process.env.LLM_MODEL || 'Qwen/Qwen3.8-27B-FP8';
const envKey = () => process.env.LLM_API_KEY || '';
/** Shared university GPUs can be slow, and some models need minutes to start. */
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 60000;

/** A readable name for More → AI connection, from the address. */
export function labelFor(base: string) {
  if (/groq\.com/i.test(base)) return 'Groq';
  if (/aalto/i.test(base)) return 'Aalto LLM';
  if (/openrouter/i.test(base)) return 'OpenRouter';
  try { return new URL(base).host; } catch { return 'OpenAI-compatible'; }
}
export const providerLabel = () => labelFor(envBase());

/** Other free models on the same service, tried when the first one is at its limit (Groq counts limits per model). */
export function fallbackModels(): string[] {
  if (process.env.LLM_FALLBACK_MODELS !== undefined) return process.env.LLM_FALLBACK_MODELS.split(',').map((s) => s.trim()).filter(Boolean);
  // Only one backup: the small gpt-oss-20b gave broken answers in testing, so it isn't used by default.
  if (/groq\.com/i.test(envBase())) return ['qwen/qwen3.8-27b'];
  return [];
}

export function clean(err: any) {
  const raw = String(err?.message || err || 'unknown error');
  return raw.replace(/Bearer\s+\S+/gi, 'Bearer [key]').replace(/(sk|gsk)[-_][0-9A-Za-z_-]{10,}/g, '[key]').slice(0, 300);
}

/** What kind of failure this is, so the chain knows how long to leave a model alone. */
export type FailKind = 'minute' | 'day' | 'auth' | 'bad_request' | 'timeout' | 'server' | 'other';
export function classify(msg: string): FailKind {
  if (/per ?day|PerDay|TPD|RPD|free_tier|daily|exceeded your current quota/i.test(msg)) return 'day';
  if (/^429|\b429\b|rate limit|RESOURCE_EXHAUSTED|per minute|TPM|RPM/i.test(msg)) return 'minute';
  if (/^40[13]\b|\b40[13]\b|invalid api key|unauthori[sz]ed|permission/i.test(msg)) return 'auth';
  if (/timeout|did not answer within/i.test(msg)) return 'timeout';
  if (/^5\d\d|\b50[0-4]\b|overloaded|UNAVAILABLE|high demand|fetch failed|ECONN|ENOTFOUND/i.test(msg)) return 'server';
  if (/^4\d\d|\b400\b|INVALID_ARGUMENT|not supported|does not support|NOT_FOUND|\b404\b/i.test(msg)) return 'bad_request';
  return 'other';
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

/** "Please try again in 682.5ms" / "1.2s" / "1m4.5s" → milliseconds, or null. */
export function retryWaitMs(msg: string): number | null {
  const m = msg.match(/try again in ((?:\d+h)?(?:\d+m(?!s))?(?:[\d.]+(?:ms|s))?)/i);
  if (!m || !m[1]) return null;
  const t = m[1];
  const h = Number((t.match(/(\d+)h/) || [])[1] || 0);
  const min = Number((t.match(/(\d+)m(?!s)/) || [])[1] || 0);
  const ms = t.match(/([\d.]+)ms$/);
  const sec = ms ? 0 : Number((t.match(/([\d.]+)s$/) || [])[1] || 0);
  return Math.round(h * 3600000 + min * 60000 + sec * 1000 + (ms ? Number(ms[1]) : 0));
}

export interface OpenAiOpts {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Can read photos. Only set for models known to accept images. */
  vision?: boolean;
}

/** One model on one OpenAI-compatible service. `maxWaitMs`: wait out a per-minute limit only if it's this short. */
export function makeOpenAiProvider(o: OpenAiOpts): LlmProvider & { model: string; label: string } {
  const label = labelFor(o.baseUrl);
  let lastOk: { at: string; model: string } | null = null;
  let lastError: { at: string; message: string; model?: string } | null = null;
  // Some servers reject parts of the request; remember what they accepted so we don't ask twice.
  let toolChoice: 'required' | 'auto' = 'required';
  // vLLM + Qwen (Aalto) understand chat_template_kwargs; gpt-oss models take reasoning_effort. Both make answers faster.
  let noThink = /aalto/i.test(o.baseUrl);
  // gpt-oss: "low"; Qwen on Groq: "none" (no thinking). Dropped automatically if a server rejects it.
  let lowEffort = /gpt-oss/i.test(o.model) || (/qwen/i.test(o.model) && !/aalto/i.test(o.baseUrl));
  const effort = /qwen/i.test(o.model) ? 'none' : 'low';

  async function post(body: any, timeoutMs: number) {
    const res = await withTimeout(
      fetch(`${o.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${o.apiKey}` },
        body: JSON.stringify(body),
      }),
      timeoutMs,
      label,
    );
    const text = await res.text();
    if (!res.ok) {
      const e: any = new Error(`${res.status}: ${text.slice(0, 400)}`);
      try {
        const j = JSON.parse(text);
        e.code = j?.error?.code;
        // Groq: the model wrote a normal answer where a tool call was required. Its words are here.
        e.failedGeneration = j?.error?.failed_generation;
      } catch { /* not JSON */ }
      throw e;
    }
    return JSON.parse(text);
  }

  async function chat(args: { system: string; turns: Turn[]; tools: ToolDecl[]; temperature?: number; timeoutMs?: number; maxWaitMs?: number }) {
    // A cap on the answer's length: Groq's free tier counts output tokens per minute (qwen: 1 000), and a
    // request asking for more than that is refused outright. A chat reply needs far less; reading a file a bit more.
    const body: any = { model: o.model, messages: toMessages(args.system, args.turns), temperature: args.temperature ?? 0.3, max_tokens: args.tools.length === 1 ? 950 : 700 };
    if (args.tools.length) body.tools = args.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    const timeout = Math.max(args.timeoutMs || 0, TIMEOUT_MS);
    const maxWait = args.maxWaitMs ?? 25000;
    let waits = 0;
    // "auto" only for this one request, after the model failed to call a tool (it wanted to answer in words).
    let autoNow = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      // One tool (reading a file): ask for exactly that tool. Several (a chat reply): any of them.
      if (args.tools.length === 1 && toolChoice === 'required' && !autoNow) body.tool_choice = { type: 'function', function: { name: args.tools[0].name } };
      else if (args.tools.length) body.tool_choice = autoNow ? 'auto' : toolChoice;
      if (noThink) body.chat_template_kwargs = { enable_thinking: false };
      else delete body.chat_template_kwargs;
      if (lowEffort) body.reasoning_effort = effort;
      else delete body.reasoning_effort;
      try {
        const out = await post(body, timeout);
        lastOk = { at: new Date().toISOString(), model: o.model };
        return out;
      } catch (err: any) {
        const msg = clean(err);
        // Groq's "tool_use_failed": the model answered in plain words (fine for small talk) or wrote the
        // tool call as text. Use what it wrote (step() turns a written tool call into a real one).
        // Only this request changes: "required" stays the default, because with "auto" these models often
        // write their tool calls as text.
        if (err?.code === 'tool_use_failed' || /tool_use_failed|Failed to call a function/i.test(msg)) {
          if (!autoNow && typeof err?.failedGeneration === 'string' && err.failedGeneration.trim()) {
            lastOk = { at: new Date().toISOString(), model: o.model };
            return { choices: [{ message: { role: 'assistant', content: err.failedGeneration } }] };
          }
          if (autoNow) throw new Error(msg);
          autoNow = true;
          continue; // retry once with tool_choice "auto"
        }
        lastError = { at: new Date().toISOString(), message: msg, model: o.model };
        console.error(`${label} error (${o.model}):`, msg);
        // Not every server accepts these extras. Drop them and try again.
        if (/^4\d\d/.test(msg) && noThink && /chat_template|enable_thinking|extra|unrecognized|not permitted|unsupported/i.test(msg)) { noThink = false; continue; }
        if (/^4\d\d/.test(msg) && lowEffort && /reasoning|unrecognized|unsupported/i.test(msg) && !/rate limit/i.test(msg)) { lowEffort = false; continue; }
        if (/^4\d\d/.test(msg) && body.max_tokens && /max_tokens|max_completion_tokens/i.test(msg) && !/rate limit|too large/i.test(msg)) { delete body.max_tokens; continue; }
        if (/^4\d\d/.test(msg) && toolChoice === 'required' && /tool_choice|required/i.test(msg) && !/rate limit/i.test(msg)) { toolChoice = 'auto'; continue; }
        // Per-minute limit with a short wait: wait it out (the chain gives a small maxWait so it can switch models instead).
        const wait = retryWaitMs(msg);
        if (classify(msg) === 'minute' && wait !== null && wait <= maxWait && waits < 2) {
          waits++;
          await new Promise((r) => setTimeout(r, wait + 300));
          continue;
        }
        const e: any = new Error(msg);
        e.retryAfterMs = wait;
        throw e;
      }
    }
    throw new Error(lastError?.message || `${label} did not answer`);
  }

  return {
    name: 'openai',
    label,
    model: o.model,
    vision: !!o.vision,
    isConfigured: () => !!o.apiKey,
    async step(args) {
      const out = await chat(args);
      const msg = out?.choices?.[0]?.message || {};
      const calls: ToolCall[] = (msg.tool_calls || []).map((c: any) => ({ id: c.id, name: c.function?.name || '', args: parseArgs(c.function?.arguments) }));
      let text = stripThinking(String(msg.content || ''));
      // A tool call written as text ({"name":"getSpending",…} or finishReply's fields as lines): run it as a real call.
      if (args.tools.length && text) {
        const found = callsInText(text, args.tools.map((t) => t.name), args.tools.length === 1 ? { name: args.tools[0].name, required: (args.tools[0].parameters as any)?.required || [] } : undefined);
        if (found.calls.length) {
          if (!calls.length) calls.push(...found.calls);
          else calls.push(...found.calls.filter((c) => !calls.some((x) => x.name === c.name)));
          text = found.rest;
        }
      }
      return { calls, text };
    },
    status: () => ({ provider: label, keyPresent: !!o.apiKey, model: o.model, candidates: [o.model], lastOk, lastError, thinking: noThink ? 'off' : lowEffort ? 'low' : 'model default', baseUrl: o.baseUrl }),
    async ping() {
      if (!o.apiKey) return { ok: false, error: 'No LLM_API_KEY reaches the server (AI Studio: Settings → Secrets; laptop: the .env file).' };
      const t0 = Date.now();
      try {
        const out = await chat({ system: 'Reply with the single word OK.', turns: [{ role: 'user', text: 'Ping' }], tools: [], temperature: 0, maxWaitMs: 3000 });
        return { ok: true, model: o.model, ms: Date.now() - t0, reply: stripThinking(String(out?.choices?.[0]?.message?.content || '')).slice(0, 40) };
      } catch (err) {
        const m = clean(err);
        return { ok: false, model: o.model, ms: Date.now() - t0, error: /fetch failed|ENOTFOUND|ECONN|getaddrinfo/i.test(m) ? `Can’t reach ${o.baseUrl}.${/aalto/i.test(o.baseUrl) ? ' Is the Aalto VPN on?' : ''} (${m})` : m };
      }
    },
  };
}

/** The models from the settings: LLM_MODEL first, then LLM_FALLBACK_MODELS (Groq: two other free models by default). */
export function openAiProvidersFromEnv() {
  const vision = (process.env.LLM_VISION_MODELS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return [envModel(), ...fallbackModels()]
    .filter((m, i, a) => a.indexOf(m) === i)
    .map((m) => makeOpenAiProvider({ baseUrl: envBase(), apiKey: envKey(), model: m, vision: vision.includes(m) }));
}

/** Kept for the single-model setup (and tests). */
export const openAiProvider = makeOpenAiProvider({ baseUrl: envBase(), apiKey: envKey(), model: envModel() });
