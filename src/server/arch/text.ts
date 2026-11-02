/** Shared text matching helpers. Pure functions - every agent may use them on its own data. */
export const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'what', 'from', 'your', 'you', 'have', 'about', 'are', 'was', 'were', 'will', 'would', 'should', 'could', 'all', 'any', 'how', 'when', 'where', 'why', 'who']);
export const words = (s: string) => s.toLowerCase().split(/[^a-z0-9€]+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
export const overlaps = (a: string[], b: string[]) => a.some((w) => b.includes(w));
export const overlapScore = (a: string[], b: string[]) => a.filter((w) => b.includes(w)).length;

// Goal words also map to transaction categories ("save" -> savings transfers, "car" -> transport).
export const CATEGORY_HINTS: Record<string, string[]> = {
  save: ['savings_transfer', 'savings_transfer_in'], saving: ['savings_transfer', 'savings_transfer_in'], savings: ['savings_transfer', 'savings_transfer_in'],
  car: ['transport'], commute: ['transport'], travel: ['transport'],
  house: ['housing'], flat: ['housing'], apartment: ['housing'], rent: ['housing'], home: ['housing'],
};
