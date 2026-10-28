// TEST ONLY: a scripted stand-in for the language model, so the tool pipeline and guardrails can be
// tested without an API key. Enabled only when LLM_PROVIDER=mock. The real app always uses Gemini.
import { LlmProvider, Turn, ToolCall } from './llm.js';

const call = (name: string, args: Record<string, any> = {}): ToolCall => ({ id: `mock-${name}-${Math.random().toString(36).slice(2, 6)}`, name, args });

function lastUserText(turns: Turn[]) {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (t.role === 'user' && !t.text.startsWith('(system)')) return t.text.toLowerCase();
  }
  return '';
}

export const mockProvider: LlmProvider = {
  name: 'mock (tests only)',
  isConfigured: () => true,
  async step({ turns, tools, system }) {
    const last = turns[turns.length - 1];
    if (tools.some((t) => t.name === 'proposeEntries')) {
      return { calls: [call('proposeEntries', { items: [{ type: 'goal', title: 'Trip to Japan', quote: 'Japan next spring, about 4000', sensitive: false, targetAmount: 4000, targetDate: '2027-04-30' }] })] };
    }
    const u = lastUserText(turns);
    if (last.role === 'user') {
      if (/make up a number/.test(u)) return { calls: [call('finishReply', { text: 'You have 99 999 € hidden somewhere.', suggestions: [], usedEntryIds: [], topic: 'other', couldHelp: true })] };
      if (/(look|search|find).*(flat|house|apartment)|for sale/.test(u)) return { calls: [call('suggestPartnerOffer', { partnerId: 'homes' })] };
      if (/financial advice/.test(u)) return { calls: [call('suggestPartnerOffer', { partnerId: 'planner' })] };
      if (/on track/.test(u)) return { calls: [call('getGoalStatus')] };
      if (/yes, move|move 300/.test(u)) return { calls: [call('offerTransfer', { amountPerMonth: 300 })] };
      if (/yes, show me|payday|plan my/.test(u)) return { calls: [call('getPayPlan')] };
      if (/wedding/.test(u)) return { calls: [call('proposeCabinetChange', { action: 'add', type: 'goal', title: 'Save for a wedding', targetAmount: 15000, targetDate: '2027-07-31', goalType: 'other', sensitive: false })] };
      if (/knee|surgery|sick/.test(u)) return { calls: [call('proposeCabinetChange', { action: 'add', type: 'fact', title: 'Mia’s knee surgery', sensitive: true })] };
      if (/human|person|adviser/.test(u)) return { calls: [call('startHandoff', { agentId: 'adviser' })] };
      if (/money go/.test(u)) return { calls: [call('getSpending', { months: 3 })] };
      return { calls: [call('finishReply', { text: 'Hi! (mock reply)', suggestions: ['Am I on track?'], usedEntryIds: [], topic: 'small_talk', couldHelp: true })] };
    }
    if (last.role === 'tool_results') {
      const r = last.results[0];
      const res: any = r.result;
      if (r.call.name === 'finishReply') return { calls: [call('finishReply', { text: 'Sorry, let me keep to what I can check.', suggestions: [], usedEntryIds: [], topic: 'other', couldHelp: true })] };
      const homeId = (system.match(/"id":"([^"]+)","type":"goal","title":"Buy/) || [])[1];
      let text = 'Done (mock).';
      let used: string[] = [];
      if (r.call.name === 'getGoalStatus' && Array.isArray(res)) {
        const g = res[0];
        text = `For “${g.title}” you have ${g.saved.toLocaleString('fi-FI')} € and ${g.monthlyGoingIn} € a month going in. You’d be about ${g.shortBy.toLocaleString('fi-FI')} € short.`;
        used = [g.goalId];
      } else if (r.call.name === 'getPayPlan') {
        text = `Your next salary is ${res.income.toLocaleString('fi-FI')} €. About ${res.spendingAveragePerMonth.toLocaleString('fi-FI')} € goes on spending. I’d suggest moving ${res.suggestedExtraMove} € more each payday.`;
        used = homeId ? [homeId] : [];
      } else if (r.call.name === 'suggestPartnerOffer') {
        text = res.shown ? 'Since you’re saving for a home, this might help.' : 'Okay.';
      } else if (r.call.name === 'offerTransfer') {
        text = 'Here you go, just confirm below 👇';
      } else if (r.call.name === 'proposeCabinetChange') {
        text = res.saved ? 'Love it! I’ve added it.' : 'That sounds hard. I won’t keep it unless you want me to.';
      } else if (r.call.name === 'startHandoff') {
        text = 'I can connect you with a Nordea adviser.';
      } else if (r.call.name === 'getSpending') {
        text = `About ${res.averagePerMonthTotal.toLocaleString('fi-FI')} € a month goes out.`;
      }
      return { calls: [call('finishReply', { text, suggestions: [], usedEntryIds: [...used, 'not-a-real-id'], topic: 'goals', couldHelp: true })] };
    }
    return { calls: [call('finishReply', { text: '…', suggestions: [], usedEntryIds: [], topic: 'other', couldHelp: true })] };
  },
};
