// The helpers Abel offers. Each opens its own chat with Abel focused on one job.
export interface Helper {
  id: string;
  name: string;
  sub: string;
  card: string;
  line: string;
  icon: string;
  cls: string;
  greet: (name: string) => [string, string];
  chips: [string, string][];
}

export const HELPERS: Record<string, Helper> = {
  abel: {
    id: 'abel', name: 'Abel', sub: 'Your Nordea assistant', card: 'Talk to Abel', line: 'Ask anything about your money', icon: 'spark', cls: 'h-abel',
    greet: (n) => [`Hi ${n} 👋 I’m Abel.`, 'How are things? Ask me anything about your money, or just tell me what’s on your mind.'],
    chips: [['Am I on track?', 'Am I on track?'], ['Where does my money go?', 'Where does my money go?'], ['Something changed', 'Something changed in my life'], ['Talk to a person', 'I’d like to talk to a person']],
  },
  autopilot: {
    id: 'autopilot', name: 'Payday autopilot', sub: 'Abel · plans each salary', card: 'Payday autopilot', line: 'Plan where each salary goes', icon: 'cycle', cls: 'h-auto',
    greet: (n) => [`Hi ${n} 👋`, 'I can plan where each salary goes: bills first, then your goals, and the rest stays yours. I only suggest. Nothing moves without your OK.'],
    chips: [['Plan my next payday', 'Plan my next payday'], ['How does it work?', 'How does the payday autopilot work?']],
  },
  budget: {
    id: 'budget', name: 'Budget helper', sub: 'Abel · spending and limits', card: 'Budget', line: 'See where your money goes', icon: 'pie', cls: 'h-budget',
    greet: (n) => [`Hi ${n} 👋`, 'I can show you where your money goes and help you set simple limits that feel realistic.'],
    chips: [['Where does my money go?', 'Where does my money go?'], ['What changed lately?', 'What changed in my spending lately?']],
  },
  invest: {
    id: 'invest', name: 'Investing', sub: 'Abel · hands over to Nora', card: 'Investing', line: 'Get ready for Nordea’s adviser Nora', icon: 'invest', cls: 'h-invest',
    greet: (n) => [`Hi ${n} 👋`, 'Nordea’s digital adviser Nora can suggest funds for you. I’ll get you ready first, so Nora already knows your goals and you don’t have to repeat yourself.'],
    chips: [['Is investing right for me now?', 'Is investing right for me now?'], ['Get me ready for Nora', 'Get me ready for Nora']],
  },
  life: {
    id: 'life', name: 'Life events', sub: 'Abel · plans for big changes', card: 'Life events', line: 'Moving, a baby, a new job', icon: 'sprout', cls: 'h-life',
    greet: (n) => [`Hi ${n} 👋`, 'Big changes are easier with a plan. Moving, a baby, a new job, a wedding: tell me what’s coming and I’ll make a short plan with you.'],
    chips: [['We’re moving', 'We’re moving soon'], ['New job', 'I’m starting a new job'], ['We’re getting married', 'We’re getting married']],
  },
  leaks: {
    id: 'leaks', name: 'Money leaks', sub: 'Abel · subscriptions and price rises', card: 'Money leaks', line: 'Find costs that crept up', icon: 'drop', cls: 'h-leaks',
    greet: (n) => [`Hi ${n} 👋`, 'I can look for subscriptions, price rises and charges that crept up without you noticing.'],
    chips: [['Find my leaks', 'Find my money leaks'], ['My electricity bill is high', 'My electricity bill is high']],
  },
  person: {
    id: 'person', name: 'Talk to a person', sub: 'Abel prepares a Nordea adviser', card: 'Talk to a person', line: 'A Nordea adviser, when you want one', icon: 'person', cls: 'h-person',
    greet: (n) => [`Hi ${n} 👋`, 'I can connect you with a Nordea adviser. I’ll show you exactly what they’d see first, and it’s shared only once.'],
    chips: [['Connect me with an adviser', 'I’d like to talk to a Nordea adviser']],
  },
};

export const HELPER_ORDER = ['abel', 'autopilot', 'budget', 'invest', 'life', 'leaks', 'person'];
