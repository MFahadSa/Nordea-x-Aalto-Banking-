/**
 * G4/V4: LLM-driven reasoning for the three agents. Each agent's model gets tools for its
 * OWN database only and never sees another agent's data in its prompt. The model PROPOSES
 * (a retrieval plan, match terms); code checks the proposal and owns numbers, evidence,
 * risk and every write. When no provider is configured or a call fails, the caller falls
 * back to the scripted behaviour (kept for the no-AI path and for tests).
 */
import { getProvider, withTimeout } from '../llm.js';
import { chainHasFreshMember } from '../llmChain.js';
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
 *  the previous hardcoded behaviour (4 steps, 15s per step + 5s outer guard). */
export function archLlmConfig(): { provider: string | null; maxSteps: number; stepTimeoutMs: number } {
  const maxSteps = Math.max(1, Number(process.env.LLM_AGENT_MAX_STEPS) || 4);
  const stepTimeoutMs = Math.max(1000, Number(process.env.LLM_STEP_TIMEOUT_MS) || 15000);
  return { provider: archLlmProviderName(), maxSteps, stepTimeoutMs };
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
  const tried: string[] = [];
  // A chain can hold a weaker first member (e.g. a reasoning model that never emits the finish
  // call). After its step budget is spent, give a fresh member ONE run of its own instead of
  // failing the run. Hard errors are NOT retried this way: the chain already failed over for
  // that step, so a retry would only double-charge the same outage.
  for (let attempt = 0; attempt < 2; attempt++) {
    const skipMembers = tried.length && chainHasFreshMember(provider, tried) ? tried : undefined;
    if (attempt > 0 && !skipMembers) break; // no fresh member to hand the run to
    const turns: Turn[] = [{ role: 'user', text: args.prompt }];
    for (let step = 0; step < maxSteps; step++) {
      let r;
      try {
        r = await withTimeout(
          provider.step({ system: args.system, turns, tools: args.tools, temperature: 0, timeoutMs: stepTimeoutMs, skipMembers }),
          stepTimeoutMs + 5000, `${args.agent} agent reasoning`);
      } catch (e) { return { result: null, error: e instanceof Error ? e.message : String(e) }; }
      if (r.answeredBy && !tried.includes(r.answeredBy)) tried.push(r.answeredBy);
      // F-D: a configured provider that produces no usable finish call is a provider failure,
      // not the scripted path - name it so the fallback is visible instead of silent.
      if (!r.calls.length) return { result: null, error: `${args.agent} model returned no tool calls (step ${step + 1}/${maxSteps})` };
      for (const call of r.calls) {
        if (call.name === args.finishTool) return { result: (call.args ?? {}) as Record<string, unknown>, answeredBy: r.answeredBy };
      }
      turns.push({ role: 'model_calls', calls: r.calls, raw: r.raw }); // keep raw parts: Gemini 3.x needs thought_signature echoed back
      turns.push({ role: 'tool_results', results: r.calls.map((call) => ({ call, result: args.runTool(call) })) });
    }
    // step budget spent without a finish call: the next attempt (if any) skips the tried members
  }
  return { result: null, error: `${args.agent} model did not call ${args.finishTool} within ${maxSteps} steps` };
}

/** Validation helpers: the model proposes, code checks. */
export const cleanTerms = (v: unknown, max: number): string[] =>
  (Array.isArray(v) ? v : [])
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.toLowerCase().trim())
    .filter((t) => /^[a-z0-9][a-z0-9 -]{1,29}$/.test(t))
    .slice(0, max);
