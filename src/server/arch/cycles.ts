/**
 * V3 cycles: one cycle = User AI > CM > Nordea > User AI, at most MAX_CYCLES per turn.
 * Best-effort protection of paid calls. These are MINIMUM call counts (each model run is at least one provider
 * call, and a run can take up to 20 steps per model), so this lowers the chance of running dry mid-cycle and
 * cannot guarantee a finish. Read from the PROCESS-wide remaining count (shared with auto insights).
 * LLM_MAX_CALLS unset (the default) means UNCAPPED: `left === null`, nothing here limits spend then.
 */
export const MAX_CYCLES = 5;
export const PLAN_CALLS = 2;   // CM plan + Nordea plan (one model run each, at least one call each)
export const REVIEW_CALLS = 1; // the returning User AI review
export const FINAL_CALLS = 1;  // the final answer call stays reserved
/** May the returning User AI review now? Needs its own call plus the reserved final answer. */
export const canReview = (left: number | null) => left === null || left >= REVIEW_CALLS + FINAL_CALLS;
/** May another full cycle start? Needs both plan runs, the next review, and the reserved final answer. */
export const canStartCycle = (left: number | null) => left === null || left >= PLAN_CALLS + REVIEW_CALLS + FINAL_CALLS;
