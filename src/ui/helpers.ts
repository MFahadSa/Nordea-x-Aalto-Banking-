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
    id: 'abel', name: 'Abel', sub: 'Your Nordea assistant', card: 'Talk to Abel', line: 'Ask anything', icon: 'spark', cls: 'h-abel',
    greet: (n) => [`Hi ${n} 👋`, 'What can I help with?'],
    chips: [['Am I on track?', 'Am I on track?'], ['Where does my money go?', 'Where does my money go?'], ['Something changed', 'Something changed in my life'], ['Talk to a person', 'I’d like to talk to a person']],
  },
  autopilot: {
    id: 'autopilot', name: 'Payday autopilot', sub: 'Abel · plans each salary', card: 'Payday autopilot', line: 'Plan each payday', icon: 'cycle', cls: 'h-auto',
    greet: (n) => [`Hi ${n} 👋`, 'I’ll plan where your salary goes. Nothing moves without your OK.'],
    chips: [['Plan my next payday', 'Plan my next payday'], ['How does it work?', 'How does the payday autopilot work?']],
  },
  budget: {
    id: 'budget', name: 'Budget helper', sub: 'Abel · spending and limits', card: 'Budget', line: 'Where money goes', icon: 'pie', cls: 'h-budget',
    greet: (n) => [`Hi ${n} 👋`, 'Want to see where your money goes?'],
    chips: [['Where does my money go?', 'Where does my money go?'], ['What changed lately?', 'What changed in my spending lately?']],
  },
  invest: {
    id: 'invest', name: 'Investing', sub: 'Abel · hands over to Nora', card: 'Investing', line: 'Get ready for Nora', icon: 'invest', cls: 'h-invest',
    greet: (n) => [`Hi ${n} 👋`, 'I’ll get you ready for Nora, Nordea’s investing adviser, so you don’t repeat yourself.'],
    chips: [['Is investing right for me now?', 'Is investing right for me now?'], ['Get me ready for Nora', 'Get me ready for Nora']],
  },
  life: {
    id: 'life', name: 'Life events', sub: 'Abel · plans for big changes', card: 'Life events', line: 'Moving, baby, new job', icon: 'sprout', cls: 'h-life',
    greet: (n) => [`Hi ${n} 👋`, 'Something big coming up? Let’s make a short plan.'],
    chips: [['We’re moving', 'We’re moving soon'], ['New job', 'I’m starting a new job'], ['We’re getting married', 'We’re getting married']],
  },
  leaks: {
    id: 'leaks', name: 'Money leaks', sub: 'Abel · subscriptions and price rises', card: 'Money leaks', line: 'Costs that crept up', icon: 'drop', cls: 'h-leaks',
    greet: (n) => [`Hi ${n} 👋`, 'I’ll look for subscriptions and price rises you might have missed.'],
    chips: [['Find my leaks', 'Find my money leaks'], ['My electricity bill is high', 'My electricity bill is high']],
  },
  person: {
    id: 'person', name: 'Talk to a person', sub: 'Abel prepares a Nordea adviser', card: 'Talk to a person', line: 'A Nordea adviser', icon: 'person', cls: 'h-person',
    greet: (n) => [`Hi ${n} 👋`, 'Want to talk to a Nordea adviser? You’ll see what they get first.'],
    chips: [['Connect me with an adviser', 'I’d like to talk to a Nordea adviser']],
  },
};

export const HELPER_ORDER = ['abel', 'autopilot', 'budget', 'invest', 'life', 'leaks', 'person'];
