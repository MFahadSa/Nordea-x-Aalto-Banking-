/** Knowledge absence is different from a statement that no action was taken. */
export function knowledgeAbsenceClaim(text:string):boolean {
 const clauses=text.split(/(?<!\d)[.!?;\n]|[.!?;\n](?!\d)|\b(?:but|however|mutta)\b/u).map(x=>x.trim()).filter(Boolean);
 return clauses.some(c=>{
  if(/^(?:nothing (?:has been|was|is|will be) (?:changed|updated|deleted|removed|transferred)|no (?:changes?|transfers?|updates?) (?:were|was|have been|has been|made)|en (?:muuttanut|tallentanut|siirtänyt)|mitään ei (?:muutettu|siirretty|tallennettu))\b/iu.test(c))return false;
  if(/(?:^|\s)(?:sinulla|minulla) ei ole (?:[^.!?]{0,35}tavoite|[^.!?]{0,35}tavoitetta|[^.!?]{0,35}muistiinpan)|\bno (?:target|goal|amount|deadline) (?:saved|stored|known)\b/iu.test(c))return true;
  if(/(?:^|\s)en (?:tiedä|muista)(?:\s|$)|(?:^|\s)ei (?:ole )?(?:tallennettua|tietoa|muistiinpano)/iu.test(c))return true;
  return /^(?:nothing|nope|ei mitään)$/iu.test(c)||/\b(?:not mentioned|could not find|no record|nothing (?:saved|stored|known)|no (?:saved|stored|known) (?:facts?|notes?|information)|(?<!\byou\s)(?:don.t know|do not know)|don.t have (?:any )?(?:notes?|information)|en (?:tiedä|muista)|ei (?:ole )?(?:tallennettua|tietoa|muistiinpano\w*))\b/iu.test(c);
 });
}
