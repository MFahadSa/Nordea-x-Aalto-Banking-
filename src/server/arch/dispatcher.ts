/**
 * The dispatcher: real message delivery between agents. When an agent posts a message to
 * another agent, the dispatcher invokes the recipient's registered handler; the handler
 * reads only its own database and replies on the bus. Nobody fabricates another agent's
 * reply anymore - the old postMessage-only log is gone.
 *
 * Delivery gating: messages to an agent that is off are left pending (the coordination
 * off-switch lives on the bus). Proposals (type 'propose') are never auto-delivered:
 * they wait for the customer's merge review.
 *
 * This module opens only the bus. Agent modules register their handlers here.
 */
import { getAgentsOff, loadBus, saveBus } from './store/busStore.js';
import type { AgentId, AgentMessage } from './types.js';

export type AgentHandler = (uid: string, msg: AgentMessage) => void;
const handlers = new Map<AgentId, AgentHandler>();
export const registerHandler = (id: AgentId, h: AgentHandler) => { handlers.set(id, h); };

export interface DispatchResult { delivered: number; leftPending: number }

/**
 * Deliver pending agent-bound messages until none remain deliverable or the budget runs out.
 * One delivered message = one step (build rounds count steps through this).
 */
export function dispatchPending(uid: string, opts?: { maxDeliver?: number; onDeliver?: () => void }): DispatchResult {
  let delivered = 0;
  for (;;) {
    const bus = loadBus(uid);
    const off = getAgentsOff(uid) ?? [];
    const deliverable = bus.messages.filter((m) =>
      // The off-switch gates an agent's REASONING (queries, rounds), never storage or
      // operations: control messages (app writes, park, status) are always delivered (G2).
      m.status === 'pending' && m.to !== 'user' && m.type !== 'propose' && (m.type === 'control' || !off.includes(m.to as AgentId)));
    const leftPending = deliverable.filter((m) => !handlers.has(m.to as AgentId)).length;
    const next = deliverable.find((m) => handlers.has(m.to as AgentId));
    if (!next) return { delivered, leftPending };
    if (opts?.maxDeliver != null && delivered >= opts.maxDeliver) {
      return { delivered, leftPending: deliverable.length };
    }
    const handler = handlers.get(next.to as AgentId)!;
    handler(uid, next);
    // If the handler did not mark the message itself, mark it read so it is never redelivered.
    const after = loadBus(uid);
    const mine = after.messages.find((m) => m.id === next.id);
    if (mine && mine.status === 'pending') {
      mine.status = 'read';
      saveBus(uid, after);
    }
    delivered++;
    opts?.onDeliver?.();
  }
}
