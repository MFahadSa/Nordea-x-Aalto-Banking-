/** v29: money-safety words and steps, shared by Abel's AI path and the offline answers. */
/** A scam or a lost card, from the customer's words. */
export const FRAUD = /\b(scam(med|mer)?|phish\w*|fraud\w*|hack(ed|er)?|stolen|stole|lost my (card|wallet|phone)|clicked (on )?(a|the|that) (link|sms|text|message)|(typed|entered|gave|shared)[^.?!]{0,25}\b(codes?|pin|password|bank ?id|credentials|card number)|someone (used|took|is using) my (card|account|money)|unknown (payment|charge)s?|didn['’]?t make (this|that|these) (payment|purchase|charge))\b/i;
export const SAFETY_LINES = 'If this might be a scam, do this now:\n• Call Nordea’s customer service: the number is on the back of your card and on nordea.fi. They can lock your codes and cards.\n• You can also block the card yourself in the app under Cards.\n• Don’t click the link again, and never share codes or your PIN.';
/** Neutral wording on purpose: the number is on the back of the card and on nordea.fi (no number written here). */
