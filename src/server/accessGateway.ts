import { db } from './db.js';
import { getAgentManifest } from './agentRegistry.js';
import { CabinetEntry, AccessLogEntry } from '../types.js';

export interface AccessGatewayResult {
  allowed: CabinetEntry[];
  blocked: { title: string; reason: string }[];
  logEntry: AccessLogEntry;
}

export function readCabinetThroughGateway(
  userId: string,
  agentId: string,
  purposeContext?: string
): AccessGatewayResult {
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

  for (const entry of allEntries) {
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
