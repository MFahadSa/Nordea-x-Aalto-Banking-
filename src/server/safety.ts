/** v29: money-safety words and steps, shared by Abel's AI path and the offline answers. */
// v31: four kinds, each with its own steps (a lost card is not a phishing link). The words come from
// the customer; code decides, so the steps appear even when the AI is down or misbehaves.

/** A lost or stolen card, wallet or phone. */
const LOST = /\b(lost|misplaced|can['’]?t find|cannot find|stolen|stole)\b[^.?!]{0,20}\b(card|wallet|phone|purse)\b|\b(card|wallet|purse)\b[^.?!]{0,12}\b(was |got |is |has been )?(lost|stolen|missing|gone)\b/i;
/** Someone close asks for money in a hurry (the "grandchild" scam). */
const FAMILY = /\b(grand(son|daughter|child|children|kid|kids)|son|daughter|nephew|niece|relative|cousin|brother|sister)\b[^.?!]{0,60}\b(send|transfer|pay|lend|money|euros?|€)\b[^]{0,80}?\b(urgent(ly)?|quick(ly)?|asap|right away|immediately|new (phone|number))\b|\bnew (phone )?number\b[^.?!]{0,60}\b(money|send|pay)\b/i;
/** Codes asked for or shared, a link in a message, a "safe account", or plain scam words. */
const SCAM = /\b(scam(med|mer|s)?|phish\w*|fraud\w*|hack(ed|er)?|safe account|click here|clicked (on )?(a|the|that) (link|sms|text|message)|(typed|entered|gave|shared|told)[^.?!]{0,25}\b(codes?|pin|password|bank ?id|credentials|card number)|(called|calling|rang|phoned|texted|text|sms|e-?mail|message|caller)\b[^.?!]{0,60}\b(codes?|pin|password|bank ?id|credentials|verify|locked|blocked|suspended|click|link)|(ask(ed|ing|s)?|want(ed|s)?)\b[^.?!]{0,20}\bfor my (codes?|pin|password|bank ?id|card))\b/i;
/** A payment the customer doesn't know. */
const UNKNOWN = /\b(don['’]?t|do not|didn['’]?t|did not|can['’]?t)\s+recogni[sz]e\b|\bnot recogni[sz]ed?\b|\bunknown (payment|charge|transaction)s?\b|\bdidn['’]?t make (this|that|these|a) (payment|purchase|charge)|\b(strange|weird|suspicious) (payment|charge|transaction)|\bsomeone (used|took|is using) my (card|account|money)/i;

/** A scam, a lost card or an unknown payment, from the customer's words. */
export const FRAUD = new RegExp([LOST, FAMILY, SCAM, UNKNOWN].map((r) => `(?:${r.source})`).join('|'), 'i');

export const SAFETY_LINES = 'If this might be a scam, do this now:\n• Nordea never asks for your online banking codes by phone, and never asks you to move money to a “safe account”. Don’t share codes and don’t move money.\n• If you already shared codes or tapped a link: call Nordea’s customer service now. The number is on the back of your card and on nordea.fi. They can lock your codes and cards.\n• You can also block the card yourself in the app under Cards.';
const LOST_LINES = 'If your card is lost or stolen, do this now:\n• Block it in the app under Cards.\n• Or call Nordea’s customer service: the number is on nordea.fi. They can lock your card.\n• Never give your codes or PIN to anyone who calls about it.';
const FAMILY_LINES = 'Before you send any money, please check first:\n• Call the person back on the number you already have for them, not one from the message.\n• Scammers often pretend to be a grandchild or a relative and say it’s urgent.\n• If you’re unsure, Nordea’s customer service can help: the number is on the back of your card and on nordea.fi.';
const UNKNOWN_LINES = 'If you don’t recognise a payment, do this now:\n• Look at it in the app under your account’s payments. I can’t tell from here whether it’s yours.\n• If it isn’t yours, block the card in the app under Cards and call Nordea’s customer service: the number is on the back of your card and on nordea.fi.';
/** Neutral wording on purpose: the number is on the back of the card and on nordea.fi (no number written here). */

/** The steps that fit the customer's words ('' when none). */
export function safetyLinesFor(text: string): string {
  if (FAMILY.test(text)) return FAMILY_LINES;
  if (LOST.test(text) && !SCAM.test(text)) return LOST_LINES;
  if (SCAM.test(text)) return SAFETY_LINES;
  if (UNKNOWN.test(text)) return UNKNOWN_LINES;
  return '';
}
/** Any of the safety steps, already in a reply (so they're shown once per conversation). */
export const SAFETY_SHOWN = /If this might be a scam|If your card is lost or stolen|Before you send any money, please check first|If you don’t recognise a payment/;
