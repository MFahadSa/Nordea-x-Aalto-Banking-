/**
 * Build rounds (AC6): open -> contributions -> each agent signals done -> the Context
 * Memory agent finalises -> stored. A round has a step limit so it always ends.
 * Agents interact only through bus messages inside a round; the round record itself is
 * coordination state on the bus until the CM agent stores it in its own DB at finalise.
 *
 * This module opens only the bus. It never touches an agent's database.
 */
import { appendMessage, busKvGet, busKvSet, loadBus } from './store/busStore.js';
import { dispatchPending } from './dispatcher.js';
import { newId, now } from './types.js';
import type { AgentId, BuildRound, StaleFlag } from './types.js';

const PARTICIPANTS: Record<BuildRound['trigger'], AgentId[]> = {
  contribution: ['personal', 'cm', 'nordea'],
  decay: ['cm', 'nordea'],
  session: ['personal', 'cm', 'nordea'],
  topup: ['cm', 'nordea'],
};

export function loadRound(uid: string, id: string): BuildRound | null {
  const raw = busKvGet(uid, `round:${id}`);
  return raw ? (JSON.parse(raw) as BuildRound) : null;
}
export function saveRound(uid: string, round: BuildRound) {
  busKvSet(uid, `round:${round.id}`, JSON.stringify(round));
  busKvSet(uid, 'round:latest', round.id);
}
export function loadLatestRound(uid: string): BuildRound | null {
  const id = busKvGet(uid, 'round:latest');
  return id ? loadRound(uid, id) : null;
}

export function roundDone(uid: string, roundId: string, agent: AgentId) {
  const round = loadRound(uid, roundId);
  if (!round || round.doneSignals.includes(agent)) return;
  round.doneSignals.push(agent);
  saveRound(uid, round);
  // Done signals are also visible in the shared log: transparency without approval (AC9).
  appendMessage(uid, { from: agent, to: 'user', type: 'done', summary: `${agent} agent signals done in build round ${roundId}.` });
}

export function recordProposals(uid: string, roundId: string, proposals: BuildRound['proposals']) {
  const round = loadRound(uid, roundId);
  if (!round) return;
  round.proposals.push(...proposals);
  saveRound(uid, round);
}
export function recordStaleFlags(uid: string, roundId: string, flags: StaleFlag[]) {
  const round = loadRound(uid, roundId);
  if (!round) return;
  round.staleFlags.push(...flags);
  saveRound(uid, round);
}

/**
 * Run one build round to completion (or to its step limit). The kickoff message goes to the
 * first actor; the dispatcher then delivers every message the agents post to each other.
 */
export function runRound(uid: string, trigger: BuildRound['trigger'], opts?: { maxSteps?: number; question?: string; sessionId?: string }): BuildRound {
  const round: BuildRound = {
    id: newId('round'),
    trigger,
    state: 'open',
    participants: PARTICIPANTS[trigger],
    doneSignals: [],
    steps: 0,
    maxSteps: opts?.maxSteps ?? 50,
    proposals: [],
    staleFlags: [],
    startedAt: now(),
    ...(opts?.sessionId ? { sessionId: opts.sessionId } : {}),
    ...(opts?.question ? { question: opts.question } : {}),
  };
  saveRound(uid, round);

  const firstActor: AgentId = trigger === 'contribution' || trigger === 'session' ? 'personal' : 'cm';
  appendMessage(uid, {
    from: 'app',
    to: firstActor, type: 'round-start', status: 'pending',
    summary: `Build round ${round.id} opens (${trigger}).`,
    payload: { roundId: round.id, trigger, ...(opts?.question ? { question: opts.question } : {}), ...(opts?.sessionId ? { sessionId: opts.sessionId } : {}) },
  });
  round.state = 'collecting';
  saveRound(uid, round);

  for (;;) {
    const { delivered } = dispatchPending(uid, {
      maxDeliver: round.maxSteps - round.steps,
      onDeliver: () => { round.steps++; },
    });
    // Handlers updated the stored record during dispatch - reload it, keep our step count.
    const fresh = loadRound(uid, round.id)!;
    fresh.steps = round.steps;
    saveRound(uid, fresh);
    Object.assign(round, fresh);
    if (round.participants.every((a) => round.doneSignals.includes(a))) break;
    if (delivered === 0) {
      round.state = 'step-limit';
      round.note = 'round ended without all done signals (stalled or step limit reached)';
      break;
    }
    if (round.steps >= round.maxSteps) {
      round.state = 'step-limit';
      round.note = `step limit ${round.maxSteps} reached`;
      break;
    }
  }

  if (round.state !== 'step-limit') {
    round.state = 'finalizing';
    saveRound(uid, round);
    const fin = appendMessage(uid, {
      from: 'app', to: 'cm', type: 'control', status: 'pending',
      summary: `Finalise build round ${round.id}.`,
      payload: { control: 'finalize-round', roundId: round.id },
    });
    dispatchPending(uid, { maxDeliver: round.maxSteps - round.steps, onDeliver: () => { round.steps++; } });
    // The round is 'stored' only when the CM agent confirms it stored the record itself (F13).
    const confirmed = loadBus(uid).messages.some(
      (m) => m.type === 'reply' && m.from === 'cm' && (m.payload as { inReplyTo?: string; stored?: boolean } | undefined)?.inReplyTo === fin.id && (m.payload as { stored?: boolean }).stored === true,
    );
    round.state = confirmed ? 'stored' : 'failed';
    if (!confirmed) round.note = 'the Context Memory agent did not confirm storing the round record';
  }
  round.closedAt = now();
  saveRound(uid, round);
  return round;
}
