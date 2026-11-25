import type {FinancialRegistry,VerifiedFact,Quantity,FactRole} from './financialRegistry.js';
/** Explicit adapter for existing code-owned outputs. Not a recursive numeric walker.
 * Source revisions must come from the owning bank snapshot/tool result at call time. */
export function registerFinanceOutput(registry:FinancialRegistry,source:{id:string;revision:string},tool:'getAccounts'|'getSalary'|'getSpending'|'getPayPlan',data:any):VerifiedFact[]{
 const facts:VerifiedFact[]=[];
 const add=(entity:string,field:string,role:FactRole,path:string,value:unknown,per?:Quantity['per'])=>{
  if(typeof value!=='number'||!Number.isFinite(value))return;
  facts.push(registry.register({sourceId:source.id,sourceRevision:source.revision,entity,field,role,kind:'quantity',quantity:{value,unit:'EUR',...(per?{per}:{})},evidence:{type:'typed-field',path}}));
 };
 if(tool==='getAccounts')for(const key of ['current','savings','carFund'])if(data?.[key]){
  add(key,'balance','balance',key+'.balance',data[key].balance);
  if(key==='savings')add(key,'saving_rate','saving',key+'.monthlyDeposit',data[key].monthlyDeposit,'month');
 }
 if(tool==='getSalary'&&data?.found===true){
  add('Income','current_income','income','latest',data.latest,'month');
  if(data.changed===true){add('Income','previous_income','income','from',data.from,'month');add('Income','income_difference','income','difference',data.difference,'month');}
 }
 if(tool==='getSpending'){
  if(data?.category){add('Spending: '+data.category,'average_spending','cost','averagePerMonth',data.averagePerMonth,'month');add('Spending: '+data.category,'current_month_spending','cost','thisMonthSoFar',data.thisMonthSoFar);}
  else {add('All tracked spending','average_spending','cost','averagePerMonthTotal',data?.averagePerMonthTotal,'month');add('All tracked spending','current_month_spending','cost','thisMonthSoFarTotal',data?.thisMonthSoFarTotal);for(const [category,value]of Object.entries(data?.averagePerMonthByCategory||{}))add('Spending: '+category,'average_spending','cost','averagePerMonthByCategory.'+category,value,'month');}
 }
 if(tool==='getSpending'&&data?.lastFullMonth){
  add('All tracked spending ('+data.lastFullMonth.month+')','last_full_month_spending','cost','lastFullMonth.total',data.lastFullMonth.total);
  for(const [category,value]of Object.entries(data.lastFullMonth.categories||{}))add('Spending: '+category+' ('+data.lastFullMonth.month+')','last_full_month_spending','cost','lastFullMonth.categories.'+category,value);
 }
 if(tool==='getPayPlan'){
  add('Payday plan','current_income','income','income',data?.income,'month');add('Payday plan','average_spending','cost','spendingAveragePerMonth',data?.spendingAveragePerMonth,'month');add('Payday plan','saving_rate','saving','alreadySavingPerMonth',data?.alreadySavingPerMonth,'month');add('Payday plan','left_over_after_spending_and_saving','balance','leftOver',data?.leftOver,'month');add('Payday plan','suggested_extra_not_approved','saving','suggestedExtraMove',data?.suggestedExtraMove,'month');add('Payday plan','buffer_kept_by_plan','balance','keepInCurrentAccount',data?.keepInCurrentAccount);
 }
 return facts;
}
