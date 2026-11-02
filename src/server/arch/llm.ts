/**
 * G4/V4: LLM-driven reasoning for the three agents. Each agent's model gets tools for its
 * OWN database only and never sees another agent's data in its prompt. The model PROPOSES
 * (a retrieval plan, match terms); code checks the proposal and owns numbers, evidence,
 * risk and every write. When no provider is configured or a call fails, the caller falls
 * back to the scripted behaviour (kept for the no-AI path and for tests).
 */
import { getProvider, withTimeout } from '../llm.js';
import { chainHasFreshMember, chainMemberName } from '../llmChain.js';
import { providerDisplayName, recordAiRun } from './aiActivity.js';
import type { ToolCall, ToolDecl, Turn } from '../llm.js';

/** True when a real (or test) provider is configured; false = scripted fallback. */
export function archLlmEnabled(): boolean {
  try { return getProvider().isConfigured(); } catch { return false; }
}

/** Which provider the agents' reasoning runs on ('mock (tests only)', 'gemini', 'openai'),
 *  or null when scripted. The UI must show this: 'model' on the mock is wiring, not quality. */
export function archLlmProviderName(): string | null {
  try { const p = getProvider(); return p.isConfigured() ? p.name : null; } catch { return null; }
}

/** G17: the agent reasoning step budget and per-step timeout are configurable via env so a
 *  slow real model gets room (or a faster one is chosen) without code edits. Defaults keep
 *  a 120s per-call timeout; the step budget is 20 per answering model (G42). */
export function archLlmConfig(): { provider: string | null; maxSteps: number; stepTimeoutMs: number } {
  const maxSteps = Math.max(1, Number(process.env.LLM_AGENT_MAX_STEPS) || 20); // G42: 20 fresh steps PER answering model
  const stepTimeoutMs = Math.max(1000, Number(process.env.LLM_STEP_TIMEOUT_MS) || 120000);
  return { provider: archLlmProviderName(), maxSteps, stepTimeoutMs };
}

/** The outer guard around ONE reasoning step. Each usable chain member gets its own full
 *  per-call limit (a failover must not inherit a nearly spent clock), plus slack for the
 *  rest period a chain may wait out. It only exists so a provider that ignores its own limit
 *  cannot hang a reply; it is never the limit a healthy call meets first. */
export function stepGuardMs(provider: { members?: { isConfigured(): boolean }[] }, stepTimeoutMs: number, skipped = 0, slackMs = 40000): number {
  const members = Array.isArray(provider.members) ? provider.members.filter((m) => m.isConfigured()).length - skipped : 1;
  return Math.max(1, members) * stepTimeoutMs + slackMs;
}

interface AgentRunArgs {
  agent: 'cm' | 'nordea' | 'personal';
  /** The customer whose agent runs; only used to record the observed outcome for the monitors. */
  uid?: string;
  system: string;
  prompt: string;
  /** Tools scoped to the agent's own store, plus exactly one finish* tool. */
  tools: ToolDecl[];
  runTool: (call: ToolCall) => unknown;
  finishTool: string;
}

/**
 * One bounded tool-calling loop: the model reads its own store through the read tools and
 * MUST end with the finish tool, whose args are the proposal. Returns the finish args, or
 * null on any failure (caller falls back to the scripted path).
 */
/** One agent reasoning run: the model's proposal, or why there is none (truthful status). */
export interface PlanOutcome<T> { plan: T | null; status: 'model' | 'scripted' | 'error'; error?: string; answeredBy?: string }

type RunOutcome = { result: Record<string, unknown> | null; error?: string; answeredBy?: string };

/** Runs the loop and records what happened (in memory) so the monitors can show it per agent. */
export async function runAgentReasoning(args: AgentRunArgs): Promise<RunOutcome> {
  const out = await runLoop(args);
  if (args.uid) recordAiRun(args.uid, args.agent, out.result ? { outcome: 'finished', provider: out.answeredBy ?? providerDisplayName(getProvider()) } : { outcome: 'error', error: out.error });
  return out;
}

async function runLoop(args: AgentRunArgs): Promise<RunOutcome> {
  const provider = getProvider();
  const { maxSteps, stepTimeoutMs } = archLlmConfig();
  // G42: the step budget is PER ANSWERING MODEL, not per run. A model that hands the run over
  // (a NO_CALLS handover, or a spent budget) does not leave the next model the leftover: the next
  // model starts a fresh budget and keeps the conversation so far. The paid-call cap (LLM_MAX_CALLS)
  // and the per-call timeout are unchanged and can stop a run before any model reaches its budget.
  const used = new Map<string, number>(); // steps taken by each answering model
  // G51: a member that answered without any tool call is skipped for the REST of this run (it is not re-asked, and not re-paid, every step).
  const unusable = new Set<string>();
  // G51: hard ceiling on loop iterations: configured members x per-model steps (a single provider counts as one member), so a handover/reset bug can never loop forever.
  const members = (provider as { members?: { isConfigured(): boolean; label?: string; name: string; model?: string }[] }).members;
  const maxIterations = Math.max(1, Array.isArray(members) ? members.filter((m) => m.isConfigured()).length : 1) * maxSteps;
  let iterations = 0;
  const turns: Turn[] = [{ role: 'user', text: args.prompt }];
  const spent = () => [...new Set([...[...used].filter(([, n]) => n >= maxSteps).map(([name]) => name), ...unusable])];
  for (;;) {
    const skipMembers = spent();
    if (skipMembers.length && !chainHasFreshMember(provider, skipMembers)) break; // every model used its budget
    if (++iterations > maxIterations) return { result: null, error: `${args.agent} model did not call ${args.finishTool} within ${maxIterations} steps in all (${maxSteps} per model x ${maxIterations / maxSteps} configured model${maxIterations === maxSteps ? '' : 's'})` };
    if (skipMembers.length) for (const t of turns) if (t.role === 'model_calls') delete t.raw; // another model continues: its raw parts are not ours
    let r;
    try {
      // On the guard the request is CANCELLED (abort signal), not just abandoned.
      const ctl = new AbortController();
      r = await withTimeout(
        provider.step({ system: args.system, turns, tools: args.tools, temperature: 0, timeoutMs: stepTimeoutMs, skipMembers: skipMembers.length ? skipMembers : undefined, signal: ctl.signal }),
        stepGuardMs(provider as never, stepTimeoutMs, skipMembers.length), `${args.agent} agent reasoning`, () => ctl.abort());
    } catch (e) { return { result: null, error: e instanceof Error ? e.message : String(e) }; }
    for (const m of r.noCallsMembers ?? []) unusable.add(m);
    // G51: an answerer that is not a configured member is not trusted as a budget key (it would reset the budget): it counts as the provider itself.
    const who = r.answeredBy && (!Array.isArray(members) || members.some((m) => chainMemberName(m as never) === r.answeredBy)) ? r.answeredBy : 'provider';
    used.set(who, (used.get(who) ?? 0) + 1);
    // F-D: a configured provider that produces no usable finish call is a provider failure,
    // not the scripted path - name it so the fallback is visible instead of silent.
    if (!r.calls.length) return { result: null, error: `${args.agent} model returned no tool calls (step ${used.get(who)}/${maxSteps} for ${who})` };
    for (const call of r.calls) {
      if (call.name === args.finishTool) return { result: (call.args ?? {}) as Record<string, unknown>, answeredBy: r.answeredBy };
    }
    turns.push({ role: 'model_calls', calls: r.calls, raw: r.raw }); // keep raw parts: Gemini 3.x needs thought_signature echoed back
    turns.push({ role: 'tool_results', results: r.calls.map((call) => ({ call, result: args.runTool(call) })) });
  }
  const names = [...used.keys()];
  return { result: null, error: `${args.agent} model did not call ${args.finishTool} within ${maxSteps} steps per model (${names.length} model${names.length === 1 ? '' : 's'} tried: ${names.join(', ')}); no model is left with steps, so the answer is scripted` };
}

/** Validation helpers: the model proposes, code checks. */
export const cleanTerms = (v: unknown, max: number): string[] =>
  (Array.isArray(v) ? v : [])
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.toLowerCase().trim())
    .filter((t) => /^[a-z0-9][a-z0-9 -]{1,29}$/.test(t))
    .slice(0, max);
