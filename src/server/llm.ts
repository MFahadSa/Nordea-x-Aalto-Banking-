// One small module for every call to a language model, so the provider can be swapped later
// (e.g. an OpenAI-compatible university gateway, or Claude) without touching the rest of the app.
import { GoogleGenAI, FunctionCallingConfigMode, ThinkingLevel } from '@google/genai';

export interface ToolDecl {
  name: string;
  description: string;
  /** Plain JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, any>;
}

/** Provider-neutral conversation item. */
export type Turn =
  | { role: 'user'; text: string; files?: { mimeType: string; data: string }[] }
  | { role: 'model'; text: string }
  | { role: 'model_calls'; calls: ToolCall[]; raw?: unknown }
  | { role: 'tool_results'; results: { call: ToolCall; result: unknown }[] };

export interface StepResult {
  calls: ToolCall[];
  text?: string;
  raw?: unknown;
}

export interface LlmProvider {
  name: string;
  isConfigured(): boolean;
  /** One model step. The model must answer with tool calls (Abel always ends with finishReply). */
  step(args: { system: string; turns: Turn[]; tools: ToolDecl[]; temperature?: number; timeoutMs?: number }): Promise<StepResult>;
  /** Providers other than Gemini report their own status for More → AI connection. */
  status?(): any;
  ping?(): Promise<any>;
}

// Which Gemini model to use. GEMINI_MODEL wins; otherwise try these in order and remember the first
// one Google accepts (model names change over time, and not every account has every model).
const CANDIDATES = (process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : [])
  // gemini-3.8-flash: Google's current stable Flash (Oct 2026). gemini-2.0-flash was shut down, so it's gone from the list.
  .concat(['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.6-flash'])
  .filter((m, i, a) => a.indexOf(m) === i);
let activeModel: string | null = null;
let lastError: { at: string; message: string; model?: string } | null = null;
let lastOk: { at: string; model: string } | null = null;

// "Thinking" makes newer models much slower. Abel's job is short replies with tools, so keep it low.
// Newer models take thinkingLevel, the 2.5 family takes thinkingBudget; each refuses the other.
// Try in this order and remember what the model accepted. LLM_THINKING=default leaves it to Google.
type ThinkMode = 'level' | 'budget' | 'none';
// Remembered per model: 3.x models take thinkingLevel, 2.5 takes thinkingBudget.
const thinkModes = new Map<string, ThinkMode>();
const forced: ThinkMode | null = process.env.LLM_THINKING === 'default' ? 'none' : null;
const thinkingFor = (m: ThinkMode) =>
  m === 'level' ? { thinkingLevel: ThinkingLevel.LOW } : m === 'budget' ? { thinkingBudget: 0 } : undefined;
// Any "invalid request" answer may mean the model doesn't accept this thinking setting, so try the next one.
// Timeouts and network errors are not retried here.
const isThinkingProblem = (msg: string) => !/timeout|fetch failed|ECONN|ENOTFOUND|network/i.test(msg) && /thinking|INVALID_ARGUMENT|invalid argument|400/i.test(msg);

/** Timing of the last answer, for More → AI connection. */
let lastTurn: { at: string; ms: number; calls: number } | null = null;
export function recordTurn(ms: number, calls: number) {
  lastTurn = { at: new Date().toISOString(), ms, calls };
}

/** Max time for one call to the model. Without this a stuck request leaves the chat "typing…" forever. */
const STEP_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 30000;

function geminiConfigured() {
  const k = process.env.GEMINI_API_KEY;
  return !!k && k !== 'MY_GEMINI_API_KEY';
}

/** Error text without anything that looks like a key. */
function clean(err: any): string {
  const raw = String(err?.message || err || 'unknown error');
  return raw.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[key]').replace(/key=[^&\s]+/gi, 'key=[key]').slice(0, 300);
}
const isModelProblem = (msg: string) => /not found|NOT_FOUND|404|is not supported|unsupported model|does not exist/i.test(msg);
/** Google is overloaded or rate-limiting: worth a short wait and a retry, then another model. */
export const isBusy = (msg: string) => /\b503\b|UNAVAILABLE|high demand|overloaded|\b429\b|RESOURCE_EXHAUSTED|try again later/i.test(msg);
/** The free key's daily limit (e.g. 20 requests per model per day). Retrying won't help until it resets. */
export const isDailyLimit = (msg: string) => /per ?day|PerDay|free_tier|exceeded your current quota/i.test(msg);
/** Models that hit their daily limit, and when to try them again. */
const exhaustedUntil = new Map<string, number>();
function retryAfterMs(msg: string) {
  const m = msg.match(/retryDelay"?:\s*"(\d+)s/) || msg.match(/retry in (\d+)h/);
  if (!m) return 3600_000;
  return msg.includes('retry in') && /h/.test(m[0]) ? Number(m[1]) * 3600_000 : Number(m[1]) * 1000;
}

/** Our own time limit or Google's: another (often faster) model may still answer in time. */
export const isTimeout = (msg: string) => /\(timeout\)|timed out|DEADLINE_EXCEEDED|\b504\b/i.test(msg);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function withTimeout<T>(p: Promise<T>, ms: number, what = 'The AI'): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} did not answer within ${Math.round(ms / 1000)} seconds (timeout)`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function callGemini(model: string, args: { system: string; contents: any[]; tools?: ToolDecl[]; temperature: number; timeoutMs?: number }) {
  const known = forced || thinkModes.get(model);
  const modes: ThinkMode[] = known ? [known] : ['level', 'budget', 'none'];
  let last: any;
  for (const m of modes) {
    try {
      const res = await callOnce(model, args, thinkingFor(m));
      thinkModes.set(model, m);
      return res;
    } catch (err) {
      last = err;
      if (!isThinkingProblem(clean(err))) throw err;
    }
  }
  throw last;
}

async function callOnce(model: string, args: { system: string; contents: any[]; tools?: ToolDecl[]; temperature: number; timeoutMs?: number }, thinkingConfig?: object) {
  // The key stays on the server: this file only runs in server.ts, never in the browser.
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const config: any = { systemInstruction: args.system, temperature: args.temperature };
  if (thinkingConfig) config.thinkingConfig = thinkingConfig;
  if (args.tools?.length) {
    config.tools = [{ functionDeclarations: args.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }];
    config.toolConfig = { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } };
  }
  return withTimeout(ai.models.generateContent({ model, contents: args.contents, config }), args.timeoutMs || STEP_TIMEOUT_MS);
}

/**
 * Try the remembered model first. If Google says it's busy (503/429), wait a moment and retry once,
 * then move on to the next model. If the model doesn't exist or didn't answer in time, move on straight away.
 * A wrong key or a network problem won't be fixed by another model, so stop there.
 */
async function generate(args: { system: string; contents: any[]; tools?: ToolDecl[]; temperature: number; timeoutMs?: number }) {
  return generateWith(callGemini, args);
}

/** The retry/fallback logic, separate from the network call so it can be tested. */
export async function generateWith(
  call: (model: string, args: any) => Promise<any>,
  args: { system: string; contents: any[]; tools?: ToolDecl[]; temperature: number; timeoutMs?: number },
  waitMs = 1200,
) {
  const order = activeModel ? [activeModel, ...CANDIDATES.filter((m) => m !== activeModel)] : CANDIDATES;
  let last: any;
  let useful: { err: any; msg: string; model: string } | null = null;
  const started = Date.now();
  // After slow answers, stop trying more models so the customer isn't left waiting (at most about two time limits).
  const budget = (args.timeoutMs || STEP_TIMEOUT_MS) * 1.5;
  const now0 = Date.now();
  const usable = order.filter((m) => (exhaustedUntil.get(m) || 0) < now0);
  if (!usable.length) {
    const msg = 'Daily free AI limit reached for every model (429). It resets later; see More → AI connection.';
    lastError = { at: new Date().toISOString(), message: msg };
    throw new Error(msg);
  }
  for (const model of usable) {
    if (last && Date.now() - started > budget) break;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await call(model, args);
        activeModel = model;
        lastOk = { at: new Date().toISOString(), model };
        return res;
      } catch (err) {
        last = err;
        const msg = clean(err);
        lastError = { at: new Date().toISOString(), message: msg, model };
        console.error(`Gemini error (${model}, try ${attempt + 1}):`, msg);
        if (isDailyLimit(msg)) { exhaustedUntil.set(model, Date.now() + retryAfterMs(msg)); useful = { err, msg, model }; break; } // don't waste requests
        if (isBusy(msg) && attempt === 0) { await sleep(waitMs); continue; } // one quick retry on the same model
        if (!isModelProblem(msg)) useful = { err, msg, model };
        if (isBusy(msg) || isModelProblem(msg) || isTimeout(msg)) break; // next model
        throw err;
      }
    }
  }
  // Report the real problem (e.g. a timeout), not just "the last fallback model doesn't exist".
  if (useful) {
    lastError = { at: new Date().toISOString(), message: useful.msg, model: useful.model };
    throw useful.err;
  }
  throw last;
}

const gemini: LlmProvider = {
  name: 'gemini',
  isConfigured: geminiConfigured,
  async step({ system, turns, tools, temperature = 0.3, timeoutMs }) {
    const contents: any[] = [];
    for (const t of turns) {
      if (t.role === 'user')
        contents.push({ role: 'user', parts: [...(t.files || []).map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.data } })), { text: t.text }] });
      else if (t.role === 'model') contents.push({ role: 'model', parts: [{ text: t.text }] });
      else if (t.role === 'model_calls')
        contents.push((t.raw as any) || { role: 'model', parts: t.calls.map((c) => ({ functionCall: { id: c.id, name: c.name, args: c.args } })) });
      else
        contents.push({
          role: 'user',
          parts: t.results.map((r) => ({ functionResponse: { id: r.call.id, name: r.call.name, response: { result: r.result } } })),
        });
    }
    const res = await generate({ system, contents, tools, temperature, timeoutMs });
    const calls: ToolCall[] = (res.functionCalls || []).map((c: any) => ({ id: c.id, name: c.name || '', args: (c.args as any) || {} }));
    return { calls, text: res.text, raw: res.candidates?.[0]?.content };
  },
};

const thinkLabel = (m?: ThinkMode) => (m === 'level' ? 'low' : m === 'budget' ? 'off' : m === 'none' ? 'model default' : 'not tried yet');

/** For the "AI connection" check in More. Never returns the key itself. */
export function aiStatus() {
  if (override?.status) return override.status();
  return {
    provider: override ? override.name : 'gemini',
    keyPresent: geminiConfigured(),
    model: activeModel || CANDIDATES[0],
    candidates: CANDIDATES,
    lastOk,
    lastError,
    thinking: thinkLabel(thinkModes.get(activeModel || CANDIDATES[0])),
    lastTurn,
  };
}

/** A tiny real request ("Reply with OK") so the customer can see whether the AI works and why not. */
export async function aiPing() {
  if (override?.ping) return override.ping();
  if (override) return { ok: true, model: override.name, ms: 0, reply: 'OK (test stand-in)' };
  if (!geminiConfigured()) return { ok: false, error: 'No Gemini key reaches the server (GEMINI_API_KEY is missing).' };
  const t0 = Date.now();
  try {
    const res = await generate({ system: 'Reply with the single word OK.', contents: [{ role: 'user', parts: [{ text: 'Ping' }] }], temperature: 0 });
    return { ok: true, model: activeModel, ms: Date.now() - t0, reply: String(res.text || '').slice(0, 40) };
  } catch (err) {
    return { ok: false, model: activeModel || CANDIDATES[0], ms: Date.now() - t0, error: clean(err) };
  }
}

/** Short, customer-safe reason for the last failure (shown under the error message in chat). */
export function lastErrorText() {
  if (override?.status) return override.status().lastError?.message || '';
  return lastError?.message || '';
}

let override: LlmProvider | null = null;
/** Swap Gemini for another provider: the Aalto LLM (LLM_PROVIDER=openai) or the scripted test stand-in (mock). */
export function setProvider(p: LlmProvider | null) {
  override = p;
}
export const setProviderForTests = setProvider;

export function getProvider(): LlmProvider {
  return override || gemini;
}

/** Tests only: forget the remembered model. */
export function resetModelForTests() {
  activeModel = null;
  exhaustedUntil.clear();
}
