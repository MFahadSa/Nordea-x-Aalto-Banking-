// Data rewards (fictional points): the customer earns from their data in two ways.
//  1. For what they share: points once for each note that becomes readable (approved, not archived, not blocked).
//  2. For how it's used: points each time a helper actually reads their notes through the access gateway.
// Both come from the gateway's real reads, so a note nobody may read earns nothing, and a preview
// ("what would the adviser see?") isn't a read. Points add to the same balance the Rewards page spends.
import { db } from './db.js';
import { CabinetEntry } from '../types.js';

export const RULES = {
  sharedPerNote: 5,
  /** Points per read, by who read. Abel reads on every reply, so it earns little, with a daily cap. */
  used: {
    abel: { points: 1, dailyCap: 10, label: 'Abel read your notes to answer you' },
    offers: { points: 3, dailyCap: 15, label: 'A partner offer was tailored with notes you allowed' },
    adviser: { points: 10, dailyCap: 20, label: 'Your adviser read what you shared' },
  } as Record<string, { points: number; dailyCap: number; label: string }>,
};

const rid = () => `dr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** Called by the gateway after every real read. */
export function rewardRead(userId: string, agentId: string, allowed: CabinetEntry[]) {
  const user = db.getUser(userId);
  if (!user || !allowed.length) return;
  const at = new Date().toISOString();
  const mine = db.getDataRewards(userId);
  let add = 0;

  // 1. Each note earns once, the first time it's actually available to a helper.
  const rewarded = new Set(mine.filter((r) => r.kind === 'shared').flatMap((r) => r.entryIds));
  for (const e of allowed) {
    if (rewarded.has(e.id)) continue;
    db.addDataReward({ id: rid(), userId, kind: 'shared', points: RULES.sharedPerNote, entryIds: [e.id], what: `You shared “${e.title}”`, at });
    add += RULES.sharedPerNote;
  }

  // 2. The read itself, up to a daily cap per helper.
  const rule = RULES.used[agentId];
  if (rule) {
    const today = at.slice(0, 10);
    const todayPts = mine.filter((r) => r.kind === 'used' && r.agentId === agentId && r.at.slice(0, 10) === today).reduce((a, r) => a + r.points, 0);
    const pts = Math.max(0, Math.min(rule.points, rule.dailyCap - todayPts));
    // Recorded even at the cap (0 points), so "how often it's used" stays true.
    db.addDataReward({ id: rid(), userId, kind: 'used', points: pts, entryIds: allowed.map((e) => e.id), agentId, what: rule.label, at });
    add += pts;
  }
  if (add) db.updateUser(userId, { points: (user.points || 0) + add });
}

const AGENT_NAME: Record<string, string> = { abel: 'Abel', offers: 'Partner offers', adviser: 'Nordea adviser' };

/** What the Rewards page shows. */
export function summary(userId: string) {
  const list = db.getDataRewards(userId);
  const entries = db.getCabinetEntries(userId);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const shared = list.filter((r) => r.kind === 'shared');
  const used = list.filter((r) => r.kind === 'used');
  const month = new Date().toISOString().slice(0, 7);
  const counts = new Map<string, number>();
  for (const r of used) for (const id of r.entryIds) counts.set(id, (counts.get(id) || 0) + 1);
  const byAgent = Object.keys(RULES.used).map((a) => {
    const rs = used.filter((r) => r.agentId === a);
    return { agentId: a, name: AGENT_NAME[a] || a, reads: rs.length, points: rs.reduce((x, r) => x + r.points, 0) };
  });
  const earnings = db.getEarnings(userId);
  return {
    rules: { sharedPerNote: RULES.sharedPerNote, used: Object.entries(RULES.used).map(([a, r]) => ({ agentId: a, name: AGENT_NAME[a] || a, points: r.points, dailyCap: r.dailyCap })) },
    sharing: {
      notesNow: entries.filter((e) => shared.some((r) => r.entryIds.includes(e.id)) && e.status !== 'archived').length,
      notesEver: shared.length,
      points: shared.reduce((a, r) => a + r.points, 0),
    },
    use: {
      reads: used.length,
      readsThisMonth: used.filter((r) => r.at.slice(0, 7) === month).length,
      points: used.reduce((a, r) => a + r.points, 0),
      byAgent,
    },
    mostUsed: [...counts.entries()]
      .map(([id, n]) => ({ id, title: byId.get(id)?.title || 'A note you removed', reads: n, removed: !byId.get(id) || byId.get(id)!.status === 'archived' }))
      .sort((a, b) => b.reads - a.reads)
      .slice(0, 5),
    recent: [...list].reverse().slice(0, 8).map((r) => ({ what: r.what, points: r.points, at: r.at, kind: r.kind, notes: r.entryIds.length })),
    moneyBack: earnings.reduce((a, e) => a + e.back, 0),
  };
}
