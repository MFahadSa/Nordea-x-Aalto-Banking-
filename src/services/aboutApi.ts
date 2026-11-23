// About you, onboarding answers and Offers for you (src/server/aboutYou.ts).
import type { AboutView, FieldKey } from '../aboutParts.js';

export interface OfferView {
  id: string; title: string; line: string; reason: string; note?: string; earns: string;
  used: { label: string; value: string; from: string }[];
  goal?: string; pinned: boolean;
  about: string; steps: string[]; url?: string;
}
export type OfferAction = 'pin' | 'unpin' | 'later' | 'unlater' | 'hide' | 'unhide' | 'reason';
export type Answers = Partial<Record<FieldKey, { values: string[]; text?: string; asIs?: boolean }>>;

async function j<T>(r: Response): Promise<T> {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as { error?: string }).error || 'That didn’t work. Try again.');
  return d as T;
}
const post = <T,>(url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => j<T>(r));

export const fetchAbout = (userId: string) => fetch(`/api/about?userId=${encodeURIComponent(userId)}`).then((r) => j<AboutView>(r));
export const saveAbout = (userId: string, answers: Answers, confirm: FieldKey[] = []) =>
  post<AboutView & { points: number }>('/api/about', { userId, answers, confirm });
export const resetAbout = (userId: string) => post<AboutView>('/api/about/reset', { userId });
export const fetchOffers = (userId: string) => fetch(`/api/offers?userId=${encodeURIComponent(userId)}`).then((r) => j<{ offers: OfferView[]; hidden: number }>(r));
export const offerAction = (userId: string, id: string, action: OfferAction, reason?: string) =>
  post<{ offers: OfferView[]; hidden: number; until?: string; goal?: string }>('/api/offers/action', { userId, id, action, reason });
