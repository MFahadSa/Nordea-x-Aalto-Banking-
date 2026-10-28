// Finnish number format, like the Nordea app: 12 000,00 and 12 000 €.
export const nfi = (n: number) =>
  Number(n).toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/−/g, '−');
export const eur = (n: number, d = 0) =>
  Number(n).toLocaleString('fi-FI', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/−/g, '−') + ' €';
export const eurP = (p: number) => eur(p, p % 1 ? 2 : 0);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLong = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const dayMonth = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
export const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1];

export function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return dayMonth(iso.slice(0, 10));
}
