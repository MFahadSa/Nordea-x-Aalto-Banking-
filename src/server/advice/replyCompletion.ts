/** Narrow reply-shape backstop, not a semantic completeness checker.
 * A lone label cannot explain or compare. A clarification question may be brief.
 * Choice/yes-no requests without an explanation request do not enter this check.
 */
export function explanationReplyProblem(request: string, reply: string): string | null {
  const explanationRequested = /\b(?:explain|compare|comparison)\b|\b(?:what(?:'s| is) the|what are the) differences?\b/iu.test(request);
  if (!explanationRequested || /[?？]\s*$/u.test(reply.trim())) return null;
  const words = reply.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
  if (words.length === 1) return 'The customer asked for an explanation or comparison, but the reply is only one word. Give a short complete explanation grounded in the supplied facts, or ask one useful clarification question. Do not claim an action completed.';
  return null;
}
