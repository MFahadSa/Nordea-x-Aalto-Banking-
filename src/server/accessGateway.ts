import { db } from './db.js';
import { getAgentManifest } from './agentRegistry.js';
import { CabinetEntry, AccessLogEntry } from '../types.js';

export interface AccessGatewayResult {
  allowed: CabinetEntry[];
  blocked: { title: string; reason: string }[];
  logEntry: AccessLogEntry;
}

/** True while the customer has an active one-time share with this agent (used for the Nordea adviser). */
export function hasActiveShare(userId: string, agentId: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return db.getShares(userId).some((s) => s.agentId === agentId && !s.revoked && s.until >= today);
}

/** The same rules as a real read, without logging: shows the customer what an agent *would* get. */
export function previewCabinetForAgent(userId: string, agentId: string) {
  return evaluate(userId, agentId, true);
}

export function readCabinetThroughGateway(
  userId: string,
  agentId: string,
  purposeContext?: string
): AccessGatewayResult {
  const { allowed, blocked, agent } = evaluate(userId, agentId, false, purposeContext);
  const logEntry: AccessLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    userId,
    agentId,
    agentName: agent.name,
    purpose: purposeContext || agent.purpose,
    itemsReadCount: allowed.length,
    blockedCount: blocked.length,
    allowedItems: allowed.map((e) => e.title),
    blockedReasons: blocked,
  };

  db.addAccessLogEntry(logEntry);

  return {
    allowed,
    blocked,
    logEntry,
  };
}

function evaluate(userId: string, agentId: string, preview: boolean, purposeContext?: string) {
  const agent = getAgentManifest(agentId) || {
    id: agentId,
    name: agentId === 'abel' ? 'Abel' : agentId,
    purpose: purposeContext || 'Banking Context Cabinet assistance',
    needs: ['cabinetEntries'],
    mayRead: ['goal', 'life_event', 'preference', 'fact', 'observation'],
    neverRead: ['unconsented_private', 'credentials'],
    canAct: false,
    nordeaEarnsMoney: false,
    avatarColor: '#0000A0',
  };

  const allEntries = db.getCabinetEntries(userId);
  const allowed: CabinetEntry[] = [];
  const blocked: { title: string; reason: string }[] = [];

  // A Nordea adviser can only read during an active one-time share the customer started.
  const shareRequired = agentId === 'adviser' && !preview && !hasActiveShare(userId, agentId);

  for (const entry of allEntries) {
    if (shareRequired) {
      blocked.push({ title: entry.title, reason: 'No active share: the customer has not shared, or stopped sharing' });
      continue;
    }

    if (entry.status === 'archived') {
      blocked.push({
        title: entry.title,
        reason: 'Item is archived in customer history',
      });
      continue;
    }

    if (entry.status === 'disputed') {
      blocked.push({
        title: entry.title,
        reason: 'Customer disputed this item as inaccurate',
      });
      continue;
    }

    if (entry.source === 'nordea' && !entry.reviewed) {
      blocked.push({
        title: entry.title,
        reason: 'Nordea synthetic observation pending customer review',
      });
      continue;
    }

    if (agentId === 'adviser' && entry.private) {
      blocked.push({ title: entry.title, reason: 'Private item: never shared with an adviser unless the customer shares it themselves' });
      continue;
    }

    if (agentId === 'offers' && entry.private) {
      blocked.push({
        title: entry.title,
        reason: 'Sensitive customer topic: strictly barred from offers',
      });
      continue;
    }

    if (entry.readableBy && entry.readableBy[agentId] === false) {
      blocked.push({
        title: entry.title,
        reason: `Customer explicitly disabled read permission for ${agent.name}`,
      });
      continue;
    }

    if (agent.mayRead && !agent.mayRead.includes(entry.type)) {
      blocked.push({
        title: entry.title,
        reason: `Agent manifest does not allow reading entries of type '${entry.type}'`,
      });
      continue;
    }

    allowed.push(entry);
  }

  return { allowed, blocked, agent };
}
