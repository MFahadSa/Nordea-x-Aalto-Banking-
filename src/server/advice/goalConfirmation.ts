import {sourceRevision} from '../arch/text.js';
import type {CabinetEntry} from '../../types.js';
export const goalRevision=(e:CabinetEntry)=>sourceRevision([e.title,e.detail,e.target,e.private,e.readableBy,e.status,e.goalType,e.reviewed,e.updatedAt,e.confirmedAt]);
export const proposalDeadline=()=>new Date(Date.now()+30*60*1000).toISOString();
export function goalProposalText(title:string,target:{amount:number;date:string},operation:'add'|'update',privateGoal:boolean,normalization?:string,audience?:CabinetEntry['readableBy']){return `Please check ${operation==='update'?'this change to':'this new goal'} "${title}": ${target.amount} EUR by ${target.date}${normalization?' ('+normalization.replace(/-/g,' ')+')':''}. ${audience?'Access stays unchanged: Nora '+(audience.abel?'can':'cannot')+' read, offers '+(audience.offers?'can':'cannot')+' read.':privateGoal?'Private, only Nora can read it.':'Nora can read it; offers cannot.'} Nothing is saved until you tap the confirmation below.`;}

export const finnishGoalRequest=(text:string)=>/\b(?:haluan|säästää|säästä|säästötavoite|tavoite|tavoitte|pyörä|kesäkuu|muuta|vaihda|poista|nimeä)\w*/iu.test(text);
export function finnishGoalProposal(title:string,target:{amount:number;date:string}|undefined,operation:string){return `${operation==='archive'?'Poistetaanko tavoite':operation==='update'?'Tarkista tavoitteen muutos':'Tarkista uusi tavoite'} "${title}".${target?' Summa '+target.amount+' euroa, määräpäivä '+target.date+'.':''} Mitään ei tallenneta tai muuteta ennen kuin napautat kortin vahvistusta.`;}
