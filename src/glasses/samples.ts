// Fictional demo inputs for the pipeline (presenter panel on the glasses page). Lauri's story, after
// the smart-glasses demo: a flat in Kalasatama, a call with Mia, lunch at Field & Fork.
export interface Moment { id: string; scene: 'street' | 'call' | 'lunch'; title: string; sub: string; signals: { kind: 'seen' | 'heard'; text: string }[]; ask?: string }

export const MOMENTS: Moment[] = [
  { id: 'flat', scene: 'street', title: 'In front of the flat', sub: 'The glasses see the sign and hear Lauri.', signals: [
    { kind: 'seen', text: 'For sale sign: 2-room flat, Kalasatama, 389 000 €' },
    { kind: 'seen', text: 'Metro station Kalasatama, 3 min walk' },
    { kind: 'heard', text: 'Lauri: Mia would love that balcony' },
    { kind: 'seen', text: 'Bus stop, line 55' },
  ] },
  { id: 'ask', scene: 'street', title: 'Ask: “Am I on track for this flat?”', sub: 'Abel answers out loud, from what Lauri allowed.', signals: [], ask: 'Am I on track to buy this flat?' },
  { id: 'call', scene: 'call', title: 'Mia calls', sub: 'Plans, and something private.', signals: [
    { kind: 'heard', text: 'Mia: lets aim for spring 2028 with the flat deposit' },
    { kind: 'heard', text: 'Mia: my new job starts in January, about 3 200 a month' },
    { kind: 'heard', text: 'Mia: my doctor appointment is on Friday' },
    { kind: 'heard', text: 'Mia: did you see the game last night' },
  ] },
  { id: 'lunch', scene: 'lunch', title: 'Lunch at Field & Fork', sub: 'Small things the agent should drop.', signals: [
    { kind: 'seen', text: 'Menu: Kale Caesar 9.50, sandwich 12.50' },
    { kind: 'heard', text: 'Lauri: I will take the sandwich' },
    { kind: 'heard', text: 'Lauri: I never want less than 2 000 in my account' },
  ] },
];

export const WHATSAPP = `14/10/2026, 19:02 - Lauri: should we look at Kalasatama again on Saturday
14/10/2026, 19:03 - Mia: yes! and let's aim for spring 2028 with the deposit
14/10/2026, 19:04 - Mia: haha the cat is on the keyboard again
14/10/2026, 19:05 - Lauri: my car loan ends in March, that frees up about 180 a month
14/10/2026, 19:06 - Mia: ok see you tonight`;

export const PAYSLIP = `Payslip October 2026 - Fictional Oy
Employee: Lauri (demo)
Gross salary 3 900.00 EUR
Overtime 0.00 EUR
Withholding tax 24.5 %
Net pay 2 860.00 EUR
Next salary review: April 2027`;

export const CALENDAR = [
  { kind: 'calendar', text: 'Saturday 10:00 flat viewing, Kalasatama' },
  { kind: 'calendar', text: 'Thursday dentist appointment' },
  { kind: 'calendar', text: 'Friday team lunch' },
  { kind: 'note', text: 'Note: ask the bank about a pre-approval before spring' },
];

/** New transactions (added, not replacing): a new monthly gym payment Nordea can notice. */
export const BANK_UPDATE = JSON.stringify({
  mode: 'incremental',
  transactions: [
    { date: '2026-08-05', description: 'Elixia gym', amount: -49, category: 'subscriptions' },
    { date: '2026-09-05', description: 'Elixia gym', amount: -49, category: 'subscriptions' },
    { date: '2026-10-05', description: 'Elixia gym', amount: -49, category: 'subscriptions' },
    { date: '2026-10-12', description: 'K-Market Kalasatama', amount: -38.2, category: 'groceries' },
  ],
});
