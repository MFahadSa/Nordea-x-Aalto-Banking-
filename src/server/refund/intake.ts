// Conversation-local refund intake. No evidence reads, consent or money changes here.
export const REFUND_ASK = 'Which shop is the refund from? Name it and I can look into it.';
export const REFUND_GENERIC = 'That does not tell me which shop. What is the shop called?';
export const REFUND_NO_SHOP = 'I cannot look into refunds from that shop. For now I can look into one shop only, which you can name if it applies.';
export type RefundDecision = { kind: 'reply'; text: string; active: boolean; lookup?: true; amount?: number } | { kind: 'consent'; statedAmount?: number } | { kind: 'pass' };

export function refundIntake(text: string, active: boolean): RefundDecision {
  const t = text.trim();
  const refund = /\b(refunds?|money back)\b/i.test(t);
  // A missing refund is not a cancellation: "not arrived" must keep the request alive.
  const cancel = /\b(cancel|stop|forget|drop|quit)\b[^.!?]{0,25}\b(refund|request|help|that|it)\b|\b(don['’]?t|do not|never)\s+(want|need)\b|^\s*(no|nope|not now|no thanks|never ?mind)\W*$/i.test(t);
  const unrelated = /\b(unrelated|weather|joke|football|recipe|hello|goodbye|scam|fraud|stolen|password|pin|cvv|cvc|otp)\b|\b(balance|salary|payday|spending|savings goal|afford|mortgage|invest|lost card|block my card)\b|\b(move|transfer|send)\b[^.!?]{0,25}\b(money|euros?|€|savings)\b/i.test(t);
  if (cancel || unrelated) return { kind: 'pass' };
  if (!refund && !active) return { kind: 'pass' };
  if (/^\s*(yes|yeah|yep|ok|okay|thanks|thank you|hello|hi|hey|bye)\W*$/i.test(t)) return { kind: 'pass' };
  if (/\bnot\s+tuulikki\b/i.test(t)) return { kind: 'pass' };
  if (/\btuulikki\b/i.test(t)) {
    const amount = t.match(/(?:€|\bEUR)\s*(\d+(?:[.,]\d{1,2})?)(?!\d)|\b(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?\b|EUR\b)|(?:about|around|roughly|paid|was)\s+(\d+(?:[.,]\d{1,2})?)(?!\d)/i);
    const stated = amount ? Number((amount[1] || amount[2] || amount[3]).replace(',', '.')) : undefined;
    if (stated !== undefined) return { kind: 'consent', statedAmount: stated };
    return { kind: 'consent' };
  }
  if (/\b(nordea|visa|mastercard|debit|credit card|my card|bank transfer)\b/i.test(t)) {
    return { kind: 'reply', text: 'That tells me how you paid, not which shop. We need the original purchase first, not an incoming refund. Do you remember the shop name or roughly how much you paid?', active: true };
  }
  if (/\b(forgot|forget|remember|don['’]?t know|do not know|check|look|find|search)\b/i.test(t) && /\b(transaction|payment|purchase|paid|shop|where|it)\b/i.test(t)) {
    return { kind: 'reply', text: 'We can look for the original purchase, rather than a refund that has already arrived.', active: true, lookup: true };
  }
  if (/^\s*(an?|the|some|any|my)?\s*(online\s*)?(shop|store|webshop|web shop|retailer|website|merchant|one)\s*[.!?]?\s*$/i.test(t)) return { kind: 'reply', text: REFUND_GENERIC, active: true };
  const money = t.match(/(?:^\s*|\b(?:around|about|roughly|paid|was)\s+|€\s*)(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|euros?|eur)?[.!?]?\s*$/i);
  const amount = money ? Number(money[1].replace(',', '.')) : undefined;
  if (amount && !/\b(january|february|march|april|may|june|july|august|september|october|november|december|in 20\d\d)\b|\d[-/]\d/i.test(t)) return { kind: 'reply', text: 'Let us look for the original purchase by that amount.', active: true, lookup: true, amount };
  if (/\b(electronic\w*|online|recently|yesterday|last week|last month|september|october|november)\b|\d|[€]/i.test(t)) {
    return { kind: 'reply', text: 'We are looking for the original purchase, not money coming back yet. The type of shop or timing alone does not identify it. What was the shop called, or roughly how much did you pay?', active: true };
  }

  if (refund) return { kind: 'reply', text: REFUND_ASK, active: true };
  // A short bare name can answer the shop question. Do not call a sentence a shop.
  if (/^[\p{L}\p{N}&'’ -]{2,40}[.!]?$/u.test(t) && t.split(/\s+/).length <= 3 && !/\b(why|how|what|when|who|help|money|paid|really|where)\b/i.test(t)) return { kind: 'reply', text: REFUND_NO_SHOP, active: true };
  if (/^(why|how|really|where)\W*$/i.test(t)) return { kind: 'reply', text: 'To help with money coming back, we first need to identify what you bought. What was the shop called?', active: true };
  return { kind: 'pass' };
}
