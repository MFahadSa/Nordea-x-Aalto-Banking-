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
    // v20: the pipeline's usefulness filter. Deterministic stand-in for a model's judgement, so the AI path
    // (not only the rule check) is exercised: money/goal words keep, health/other people private, rest drop.
    if (tools.some((t) => t.name === 'judgeSignals') && last.role === 'user') {
      const items = last.text.split('\n').map((line) => {
        const m = line.match(/^(\d+)\.\s*(?:\[[^\]]*\]\s*)?(.*)$/);
        if (!m) return null;
        const n = Number(m[1]); const t = m[2];
        if (/health|doctor|surgery|appointment|pregnan/i.test(t)) return { n, decision: 'private', reason: 'health, another person', type: 'fact', title: t.slice(0, 50), detail: '' };
        if (/flat|apartment|deposit|mortgage|viewing|kalasatama|spring 2028/i.test(t)) return { n, decision: 'keep', reason: 'touches the flat goal', type: /aim|goal|deposit/i.test(t) ? 'goal' : 'fact', title: t.replace(/^.*?:\s*/, '').slice(0, 60), detail: t.slice(0, 120) };
        if (/salary|payslip|raise|bonus|income/i.test(t)) return { n, decision: 'keep', reason: 'changes affordability', type: 'fact', title: t.slice(0, 60), detail: t.slice(0, 120) };
        if (/prefer|never want|always/i.test(t)) return { n, decision: 'keep', reason: 'a lasting preference', type: 'preference', title: t.slice(0, 60), detail: t.slice(0, 120) };
        return { n, decision: 'drop', reason: 'not related to any goal' };
      }).filter(Boolean);
      return { calls: [call('judgeSignals', { items })] };
    }
    if (tools.some((t) => t.name === 'proposeEntries') && last.role === 'user' && last.files?.length) {
      return { calls: [call('proposeEntries', { kind: 'price_tag', summary: 'A price tag for a sofa: 1 290 €.', amount: 1290, items: [] })] };
    }
    if (tools.some((t) => t.name === 'proposeEntries') && last.role === 'user' && /Planning evening/.test(last.text)) {
      // Shaped like a real Gemini answer to lauri-planning-notes.md: month-only dates, an amount as text.
      return { calls: [call('proposeEntries', { kind: 'notes', summary: 'Notes from a planning evening with Mia.', items: [
        { type: 'goal', title: 'Honeymoon in Japan', detail: 'Trip right after the wedding', quote: 'about 4 000 €, trip in August 2027', sensitive: true, targetAmount: '4 000 €', targetDate: '2027-08' },
        { type: 'goal', title: 'Flat deposit in Espoo', detail: 'Deposit 35 000 € instead of 30 000 €', quote: 'the deposit should be 35 000 €', sensitive: false, targetAmount: 35000, targetDate: 'April 2028', goalType: 'home' },
        { type: 'preference', title: 'Minimum balance', detail: 'At least 2 000 € in the current account', quote: 'at least 2 000 €', sensitive: false },
        { type: 'life_event', title: 'Mia starts a new job', detail: 'January 2027, about 3 200 € a month', quote: "Mia's new job starts in January 2027", sensitive: false },
      ] })] };
    }
    if (tools.some((t) => t.name === 'proposeEntries')) {
      return { calls: [call('proposeEntries', { kind: 'notes', summary: 'Your travel notes.', items: [{ type: 'goal', title: 'Trip to Japan', quote: 'Japan next spring, about 4000', sensitive: false, targetAmount: 4000, targetDate: '2027-04-30' }] })] };
    }
    // G4/V4: the arch agents' planning tools get deterministic mock plans, so tests drive
    // the LLM path end to end (real providers answer the same tools live).
    if (tools.some((t) => t.name === 'finishRiskLevels')) {
      // R2: the User AI level call. Read the own goals first (the tool loop a real model runs), then answer every
      // card by the plain rubric reading for a typed goal: level 0, evidence = the goal row. The code floor raises
      // sensitive ones; tests that need other answers swap in their own step.
      if (!turns.some((x) => x.role === 'tool_results')) return { calls: [call('listMyGoals', {})] };
      const cards = [...lastUserText(turns).matchAll(/^- card (\S+) \|/gm)].map((m) => m[1]);
      return { calls: [call('finishRiskLevels', { levels: cards.map((id) => ({ card: id, level: 0, reason: 'mock: a goal the customer typed, restated without new claims (rubric L0)', evidence: [`goal:${id}`] })) })] };
    }
    if (/personal banking assistant agent/.test(system ?? '')) {
      // The personal agent's reply composer: first read its own User DB (the tool loop a
      // real model runs), then echo the most figure-bearing fact line. Figures stay
      // byte-identical so the grounded-figure guard passes exactly as it must live.
      if (tools.some((t) => t.name === 'listMyGoals') && !turns.some((x) => x.role === 'tool_results')) {
        return { calls: [call('listMyGoals', {})] };
      }
      const facts = [...lastUserText(turns).matchAll(/^- (.+)$/gm)].map((m) => m[1]);
      const withNum = facts.find((f) => /\d/.test(f)) ?? facts[0] ?? '';
      return { calls: [call('finishReply', { reply: withNum ? `based on your records: ${withNum}.` : 'i do not have enough in your records to answer that yet.' })] };
    }
    if (tools.some((t) => t.name === 'finishRetrievalPlan')) {
      const titles = (lastUserText(turns).match(/goal titles: (.+)$/mi)?.[1] ?? '').split(';').map((s) => s.trim()).filter(Boolean);
      const firstTurn = turns.find((x) => x.role === 'user');
      if (turns.some((x) => x.role === 'tool_results')) {
        return { calls: [call('finishRetrievalPlan', { goalTitles: titles, reason: 'mock: every goal needs fresh evidence' })] };
      }
      void firstTurn;
      return { calls: [call('listMyEntries', {})] };
    }
    if (tools.some((t) => t.name === 'finishMatchTerms')) {
      const titles = (lastUserText(turns).match(/goal titles: (.+)$/mi)?.[1] ?? '').split(';').map((s) => s.trim()).filter(Boolean);
      if (turns.some((x) => x.role === 'tool_results')) {
        return { calls: [call('finishMatchTerms', { terms: Object.fromEntries(titles.map((g) => [g, ['wash']])) })] };
      }
      return { calls: [call('listMyCategories', {})] };
    }
    const u = lastUserText(turns);
    if (last.role === 'user') {
      if (/make up a number/.test(u)) return { calls: [call('finishReply', { text: 'You have 99 999 € hidden somewhere.', suggestions: [], usedEntryIds: [], topic: 'other', couldHelp: true })] };
      if (/(look|search|find).*(flat|house|apartment)|for sale/.test(u)) return { calls: [call('suggestPartnerOffer', { partnerId: 'homes' })] };
      if (/financial advice/.test(u)) return { calls: [call('suggestPartnerOffer', { partnerId: 'planner' })] };
      if (/on track|deposit do i have/.test(u)) return { calls: [call('getGoalStatus')] };
      if (/afford/.test(u)) return { calls: [call('checkAffordability', { amount: Number((u.match(/(\d[\d\s]*)\s*€/) || ['', '0'])[1].replace(/\s/g, '')) })] };
      if (/yes, move|move 300/.test(u)) return { calls: [call('offerTransfer', { amountPerMonth: 300 })] };
      if (/yes, show me|payday|plan my/.test(u)) return { calls: [call('getPayPlan')] };
      if (/wedding/.test(u)) return { calls: [call('proposeCabinetChange', { action: 'add', type: 'goal', title: 'Save for a wedding', targetAmount: /20 ?000|20k/.test(u) ? 20000 : 15000, targetDate: '2027-07-31', goalType: 'other', sensitive: false })] };
      if (/flat deposit/.test(u)) return { calls: [call('proposeCabinetChange', { action: 'add', type: 'goal', title: 'Flat deposit', targetAmount: 35000, targetDate: '2028-04-30', goalType: 'home', sensitive: false })] };
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
        // The goal the customer is talking about (flat / deposit / home), else the first one.
        const g = (/flat|deposit|home|it\b/i.test(u) && res.find((x: any) => /flat|home/i.test(x.title))) || res[0];
        text = `For “${g.title}” you have ${g.saved.toLocaleString('fi-FI')} € of ${g.target.toLocaleString('fi-FI')} € and ${g.monthlyGoingIn} € a month going in. You’d be about ${g.shortBy.toLocaleString('fi-FI')} € short.`;
        used = [g.goalId];
      } else if (r.call.name === 'getPayPlan') {
        text = `Your next salary is ${res.income.toLocaleString('fi-FI')} €. About ${res.spendingAveragePerMonth.toLocaleString('fi-FI')} € goes on spending. I’d suggest moving ${res.suggestedExtraMove} € more each payday.`;
        used = homeId ? [homeId] : [];
      } else if (r.call.name === 'suggestPartnerOffer') {
        text = res.shown ? 'Since you’re saving for a home, this might help.' : 'Okay.';
      } else if (r.call.name === 'offerTransfer') {
        text = 'Here you go, just confirm below 👇';
      } else if (r.call.name === 'proposeCabinetChange') {
        text = res.saved ? 'Love it! I’ve added it.' : res.alreadyKnown ? 'I already have that.' : res.similarTo ? 'You already have something like this. Choose below.' : 'That sounds hard. I won’t keep it unless you want me to.';
      } else if (r.call.name === 'startHandoff') {
        text = 'I can connect you with a Nordea adviser.';
      } else if (r.call.name === 'getSpending') {
        text = `About ${res.averagePerMonthTotal.toLocaleString('fi-FI')} € a month goes out${res.averagePerMonthByCategory?.housing ? `, ${res.averagePerMonthByCategory.housing.toLocaleString('fi-FI')} € of it on housing` : ''}.`;
      } else if (r.call.name === 'checkAffordability') {
        text = `${res.amount.toLocaleString('fi-FI')} € would come out of your ${res.savingsBalance.toLocaleString('fi-FI')} € savings.`;
      }
      return { calls: [call('finishReply', { text, suggestions: [], usedEntryIds: [...used, 'not-a-real-id'], topic: 'goals', couldHelp: true })] };
    }
    return { calls: [call('finishReply', { text: '…', suggestions: [], usedEntryIds: [], topic: 'other', couldHelp: true })] };
  },
};
