/**
 * Sensitive-topic matchers (code backstops, word-bounded so "reunion" and "drugstore" are
 * NOT hits). Two levels on purpose (F23):
 *  - ABEL_PRIVATE_TOPIC: the deliberately narrow guard for Abel in the main app - everyday
 *    banking talk ("pay off my student loan debt", "works at the hospital") is NOT private.
 *  - SENSITIVE_TOPIC: the wider list for the architecture's AC7 risk rules (what waits for
 *    the customer). Plain "debt" is NOT here either: it is normal loan talk and would send
 *    every loan entry to review; debt distress is caught by "debt collector", "arrears",
 *    "bankrupt" and "can't pay". Extend here, not in copies.
 */

/** Abel's narrow private-topic guard (was abel.ts's own list before F21). */
export const ABEL_PRIVATE_TOPIC = /\b(health|illness|ill|sick|cancer|diagnos\w*|pregnan\w*|baby on the way|ivf|divorc\w*|separation|separated|affair|therap\w*|depress\w*|anxiety|anxious|panic attack|disabilit\w*|disabled|surgery|hospitali[sz]\w*|debt collectors?|gambl\w*|addict\w*)\b/i;

/** The wider AC7 risk list: high-risk proposals always wait for the customer. */
export const SENSITIVE_TOPIC = /\b(health|illness|ill|sick|cancer|diagnos\w*|pregnan\w*|baby on the way|ivf|divorc\w*|separation|separated|affair|therap\w*|depress\w*|anxiety|anxious|panic attack|disabilit\w*|disabled|surgery|hospitali[sz]\w*|debt collectors?|arrears|bankrupt\w*|can't pay|cant pay|gambl\w*|addict\w*|religion|religious|church|mosque|prayer|politic\w*|election|trade union|dating|sexual\w*|ethnic\w*)\b/i;

export const isSensitiveTopic = (text: string) => SENSITIVE_TOPIC.test(text);
