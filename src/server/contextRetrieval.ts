import { sourceRevision } from './arch/text.js';

/** Current permission is checked by the owning source adapter before rows enter this view.
 * Merely being eligible is not exposure and cannot ground an answer. */
export interface ContextSource {
  owner: 'cabinet' | 'personal' | 'cm' | 'nordea';
  id: string;
  revision: string;
  title: string;
  detail: string;
  data?: unknown;
  dependencies?: SourceRef[];
  discoveryOnly?: boolean;
}
export interface SourceRef { owner: ContextSource['owner']; id: string; revision: string }
export interface RetrievalPage {
  rows: ContextSource[];
  truncated: boolean;
  nextCursor?: string;
  checked: boolean;
  note: string;
}
const key = (r: SourceRef) => `${r.owner}:${r.id}`;
const tokens = (s: string): string[] => s.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
const STOP=new Set(['the','and','for','with','what','that','this','about','your','you','have','can','could','please','help','would','want','need','from','was','are','there','saved','know','tell','remember','my','do','does','anything','did','had','has','is','it','me','i','of','to','in','a','an','minun','minulla','sinä','mitä','voitko','ole','on','ja','se','että']);
/** Limited common banking/product bridge, not semantic search. Finnish inflections
 * are matched on explicit stems; arbitrary translations still need model/tool queries. */
const ALIASES:[RegExp,string[]][]=[
 [/^kuntosali|^sportschool|^gym$/u,['gym','kuntosali','sportschool']],
 [/^sohva|^sofa$|^couch$/u,['sofa','couch','sohva']],
 [/^puhelin|^phone$|^mobile$|^elisa$/u,['phone','mobile','elisa','puhelin']],
 [/^vakuut|^insurance$/u,['insurance','vakuutus']],
 [/^auto|^car$|^cra$|^vehicle$|^motor$|^volvo$/u,['car','cra','vehicle','auto','auton','autostani','volvo']],
 [/^korjau|^repair$|^service$/u,['repair','service','korjaus','korjausta']],
 [/^muut|^kaupunk|^relocat|^moving$|^move$|^city$|^town$/u,['moving','move','relocating','city','town','muuttaa','kaupunkiin']],
 [/^mökk|^cottag|^summer$|^kesä|^sauna$|^remont|^renovat/u,['cottage','summer','sauna','renovation','mökki','remontti']],
 [/^asunto|^koti|^home$|^flat$|^apartment$|^house$/u,['home','flat','apartment','house','asunto','koti']],
 [/^säästö|^saving|^reserve$|^buffer$/u,['saving','savings','reserve','buffer','säästö']],
 [/^hä[äa]|^wedding$/u,['wedding','häät']],
];
export const contextTerms=(text:string)=>{const base=tokens(text).filter(t=>t.length>1&&!STOP.has(t));return [...new Set(base.flatMap(t=>[t,...ALIASES.filter(([re])=>re.test(t)).flatMap(([,a])=>a)]))];};
export const broadSavedRequest=(text:string)=> /\b(?:everything|all (?:you know|my (?:saved|notes|context))|about me|what (?:have i|did i) (?:save|saved|store|stored)(?: about me)?(?=[?.! ]*$))\b|kaikki.*(?:tiedät|muisti)|mitä.*(?:tiedät minusta|minusta tiedät)|(?:muistissa|muistiinpanoja|saved notes)|mitä (?:olen |oon )?tallentanut(?: minusta)?[?.! ]*$/iu.test(text);
export const savedRecallRequest=(text:string)=>broadSavedRequest(text)||/\b(?:got anything|note somewhere|did i mention|remind me what|anything saved|what was it|wat do u no)\b|onko sinulla tietoa|muistatko/iu.test(text)||/\b(?:what (?:do you (?:know|remember)|did i (?:tell|save)|have i (?:told|saved))|tell me about my|(?:do you|does nora) (?:know|remember|have).*my|my (?:saved|stored) (?:facts?|notes?|context))\b|(?:mitä|kerro).*(?:tiedät|muistat|tallenn|autostani|suunnitelm)/iu.test(text);
/** The direct inventory formatter is restricted to a single, amount-free question.
 * Anything with another clause or money request stays in the full conversation loop. */
export const mixedSavedRequest=(text:string)=> /\d|€|\b(?:and|also|then|but|plus|too|week|weekly|month|monthly|plan|calculate|afford|transfer|budget)\b|[;\n]|[?.!].*\p{L}|\b(?:ja|myös|mutta|sitten|lisäksi)\b|suunnit|kuukaud|viiko|laske|autatko/iu.test(text);

const MAX_ROWS = 6;
const MAX_CHARS = 8000;

/** One turn's exact source exposure, used for prompt content, grounding and provenance.
 * Call include only when content is actually added to a provider request. */
export class TurnExposure {
  private refs = new Map<string, SourceRef>();
  private rows = new Map<string, ContextSource>();
  private visible = new Set<string>();
  include(rows: ContextSource[]) {
    for (const row of rows) {
      this.rows.set(key(row), row);this.visible.add(key(row));
      this.inherit([{owner:row.owner,id:row.id,revision:row.revision}, ...(row.dependencies || [])]);
    }
  }
  inherit(refs: SourceRef[]) {
    for (const ref of refs) {
      this.refs.set(key(ref)+':'+ref.revision, ref);
    }
  }
  snapshot(): SourceRef[] { return [...this.refs.values()]; }
  content(): ContextSource[] { return [...this.rows.values()]; }
  inheritVisible(keys:string[]) {for(const k of keys)this.visible.add(k);}
  visibleKeys():string[]{return [...this.visible];}
  get visibleCount(): number { return this.visible.size; }
}

/** Local bounded matching, not a semantic quality guarantee. The model can reformulate
 * queries through the same interface. Cursors bind to query AND source revisions. */
export function retrieveContext(sources: ContextSource[], args: { query?: string; broad?: boolean; cursor?: string; sourceRefs?: SourceRef[] }): RetrievalPage {
  const query = String(args.query || '').slice(0, 400);
  const terms = contextTerms(query);
  const requested = new Set((args.sourceRefs || []).map(key));
  // The cabinet and owning-store adapter may describe the same entity. Page it once.
  const unique=sources.filter((r,i,a)=>a.findIndex(x=>x.id===r.id || x.title===r.title&&x.detail===r.detail)===i);
  const ranked = unique.map((row, index)=> {
    const body = contextTerms(`${row.title} ${row.detail}`);
    const score = terms.reduce((n,t)=>n+(body.includes(t)?1:0),0);
    return {row,index,score};
  }).filter(x=>args.broad || requested.has(key(x.row)) || x.score > 0)
    .sort((a,b)=>Number(requested.has(key(b.row)))-Number(requested.has(key(a.row))) || b.score-a.score || a.index-b.index);
  const signature = sourceRevision([query,!!args.broad,[...requested].sort(),ranked.map(x=>[key(x.row),x.row.revision])]);
  let offset=0;
  if (args.cursor) {
    const match=/^([a-f0-9]{64}):(\d+)$/.exec(args.cursor);
    if (!match || match[1]!==signature) return {rows:[],truncated:false,checked:false,note:'The source view changed or the cursor is invalid. Search again.'};
    offset=Number(match[2]);
    if (!Number.isSafeInteger(offset) || offset>ranked.length) return {rows:[],truncated:false,checked:false,note:'Invalid source cursor. Search again.'};
  }
  if (!args.broad && !terms.length && !requested.size) return {rows:[],truncated:false,checked:false,note:'No lookup was performed. Supply search words or an explicit broad-inspection request.'};
  const rows:ContextSource[]=[];
  let size=0;let next=offset;
  for (;next<ranked.length && rows.length<MAX_ROWS;next++) {
    const row=ranked[next].row;
    const chars=JSON.stringify(row).length;
    if (chars>MAX_CHARS) {
      // Do not silently crop a source into a different fact or skip it as if absent.
      if(!rows.length) return {rows:[],truncated:true,checked:true,note:'A matching saved item exceeds the safe retrieval size. Its contents have not been supplied. Do not claim no saved item exists.'};
      break;
    }
    if(size+chars>MAX_CHARS)break;
    rows.push(row);size+=chars;
  }
  const truncated=next<ranked.length;
  return {rows,truncated,...(truncated?{nextCursor:`${signature}:${next}`} :{}),checked:true,note:truncated?'Partial saved-context results. More matching items remain; do not describe this as everything known.':'This bounded search is complete for these terms, not proof that no other related saved fact exists.'};
}

/** Resolve current refs against owners before reusing historical content. Absence from
 * the current retrieval page does not revoke a still-permitted source. */
export function referencesCurrent(refs: SourceRef[], current: ContextSource[]): boolean {
  const byId=new Map(current.map(row=>[key(row),row]));
  return refs.every(ref=>{const row=byId.get(key(ref));return row?.revision===ref.revision && (row.dependencies||[]).every(dep=>byId.get(key(dep))?.revision===dep.revision);});
}

/** Empty match is not absence. Expose a bounded, permission-filtered discovery page of
 * titles only. Title-only revisions cannot inherit unseen details. */
export function discoverySources(sources:ContextSource[]):ContextSource[]{
 return sources.filter(r=>r.id!=='app-bank-core'&&!r.discoveryOnly).map(r=>({owner:r.owner,id:r.id+':title',revision:sourceRevision(r.title),title:r.title,detail:'',discoveryOnly:true}));
}

/** Narrow personal-context inquiry, not a request to calculate or change anything.
 * This controls an evidence contract, not an inference that a saved note is relevant. */
export function personalContextQuestion(text:string):boolean {
 if(mixedSavedRequest(text)||/\b(?:pension|income|paid|payment|transaction|come in|know me|name|call me|who am i|on track|keep|store|retain|privacy|balance|spend|spending|afford|interest|rate|salary|payday|account|eligible|qualify|should|could|can i|would|why|how)\b|paljonko|kannatt|voinko/iu.test(text))return false;
 return /\b(?:my|i|me|our|mine)\b|minu|mulla|mul|meidän|olenko|onko min|kesäsuunn|remontti/iu.test(text)
   && /\?|^(?:what|where|when|do|did|have|has|am|is|was|tell|remind|mitä|missä|milloin|onko|olenko|kerro|muistat)/iu.test(text);
}
