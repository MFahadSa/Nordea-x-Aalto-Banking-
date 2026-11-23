/** Conservative tool capability scope. Null preserves the general workflow.
 * This does not prove facts, choose sources or create permission to write.
 */
export function recallToolScope(text:string):ReadonlySet<string>|null {
 const t=text.trim();
 const mixed=/\b(?:calculate|if|extra|add|put|set|create|save(?!d)|change|update|move|raise|reduce|plan|budget|compare|should|explain|open|apply|eligible|qualify|how does|how do|ASP|Kela|PS account|tax credit)\b|\b(?:laske|jos|lisää|muuta|tallenna|suunnittele|budjet\w*|avaa|miten)\b/iu;
 // An explicit no-change qualifier is a read constraint, not a mixed change operation.
 const operation=t.replace(/\b(?:please\s+)?(?:do not|don.t)\s+(?:change|save|update|set up)\s+(?:anything|it|this|my goal)[.!]?/giu,'');
 if(mixed.test(operation))return null;
 // Compact only one simple interrogative. Coordinated/subsequent clauses are
 // uncertain operations, so keep the general safe workflow rather than dropping work.
 const clauses=operation.split(/[.!?;,]|\b(?:and|then|afterwards|ja|sitten)\b/iu).map(x=>x.trim()).filter(Boolean);
 if(clauses.length!==1)return null;
 const read=/\b(?:what (?:did|have) I|did I|have I|remind me|recall|what do (?:my|your) notes|how much have I saved|what is my|what are my|my (?:target|deadline|goal)|target,|deadline)\b|\b(?:muistatko|tavoitteeni|muistiinpano\w*)\b/iu.test(operation);
 return read?new Set(['finishReply','getMoreSaved','getGoalStatus']):null;
}
