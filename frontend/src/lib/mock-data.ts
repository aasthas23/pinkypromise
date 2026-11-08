export type Tactic = "Urgency" | "Authority" | "Fear" | "Rewards" | "Social engineering";

export interface Customer {
  id: string;
  name: string;
  initials: string;
  vulnerability: number; // 0-100, higher = riskier
  simulations: number;
  training: number; // % complete
  lastSimulation: string;
  trend: number[];
  susceptibility: Record<Tactic, number>;
  recognized: string[];
  missed: string[];
  summary: string;
}

export const CURRENT_CUSTOMER_ID = "alex";

export const customers: Customer[] = [
  { id: "alex", name: "Alex Rivera", initials: "AR", vulnerability: 46, simulations: 3, training: 40, lastSimulation: "2026-11-04", trend: [72, 64, 58, 46],
    susceptibility: { Urgency: 70, Authority: 55, Fear: 40, Rewards: 30, "Social engineering": 45 },
    recognized: ["Too-good-to-be-true offer"], missed: ["Urgency", "Authority"],
    summary: "Alex hesitated when the caller claimed to be from T-Mobile support, but refused to share a code after a reminder." },
  { id: "maria", name: "Maria Chen", initials: "MC", vulnerability: 22, simulations: 7, training: 90, lastSimulation: "2026-11-06", trend: [48, 39, 30, 22],
    susceptibility: { Urgency: 25, Authority: 20, Fear: 15, Rewards: 30, "Social engineering": 20 },
    recognized: ["Urgency", "Authority", "Requests for verification codes"], missed: ["Rewards"],
    summary: "Maria consistently asks for verification and hangs up when pressured." },
  { id: "james", name: "James O'Connor", initials: "JO", vulnerability: 78, simulations: 2, training: 15, lastSimulation: "2026-10-28", trend: [84, 78],
    susceptibility: { Urgency: 85, Authority: 80, Fear: 75, Rewards: 60, "Social engineering": 70 },
    recognized: [], missed: ["Fear", "Authority", "Requests for verification codes"],
    summary: "James read a code aloud when told his account would be locked. Needs priority coaching." },
  { id: "priya", name: "Priya Natarajan", initials: "PN", vulnerability: 35, simulations: 5, training: 60, lastSimulation: "2026-11-02", trend: [55, 47, 40, 35],
    susceptibility: { Urgency: 40, Authority: 35, Fear: 30, Rewards: 50, "Social engineering": 25 },
    recognized: ["Fear", "Authority"], missed: ["Rewards"],
    summary: "Priya is skeptical of security warnings but was tempted by the discount offer." },
  { id: "dorothy", name: "Dorothy Williams", initials: "DW", vulnerability: 64, simulations: 4, training: 30, lastSimulation: "2026-10-31", trend: [80, 74, 69, 64],
    susceptibility: { Urgency: 65, Authority: 75, Fear: 60, Rewards: 45, "Social engineering": 65 },
    recognized: ["Rewards"], missed: ["Authority", "Social engineering"],
    summary: "Dorothy trusts callers who sound official. Recommend the agent-verification lesson." },
  { id: "marcus", name: "Marcus Johnson", initials: "MJ", vulnerability: 18, simulations: 9, training: 100, lastSimulation: "2026-11-07", trend: [40, 31, 25, 18],
    susceptibility: { Urgency: 15, Authority: 20, Fear: 10, Rewards: 25, "Social engineering": 15 },
    recognized: ["Urgency", "Authority", "Fear", "Rewards"], missed: [],
    summary: "Marcus is a safety champion — great candidate for peer tips." },
];

export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface Scenario {
  id: Difficulty;
  label: string;
  title: string;
  duration: string;
  blurb: string;
  caller: string;
  script: { who: "caller" | "you"; text: string; flag?: string }[];
}

export const scenarios: Scenario[] = [
  { id: "beginner", label: "Beginner", title: "Suspicious discount offer", duration: "~2 min", caller: "\"Rewards Team\"",
    blurb: "A caller offers an amazing deal that sounds a little too sweet.",
    script: [
      { who: "caller", text: "Hi! Congrats, you've been selected for 80% off your plan for a whole year!", flag: "Too-good-to-be-true offer" },
      { who: "you", text: "Wow, really? How did I get picked?" },
      { who: "caller", text: "Loyal customers only! But the offer expires in 10 minutes.", flag: "Urgency" },
      { who: "you", text: "Hmm, can I call T-Mobile back to check?" },
      { who: "caller", text: "Just read me the code we text you and it's locked in.", flag: "Requests for verification codes" },
      { who: "you", text: "No thanks. I'll verify through the app first." },
    ] },
  { id: "intermediate", label: "Intermediate", title: "Fake T-Mobile support rep", duration: "~3 min", caller: "\"T-Mobile Support\"",
    blurb: "Someone claims to be support and needs to “confirm your identity.”",
    script: [
      { who: "caller", text: "Hello, this is Jordan from T-Mobile Support, badge 4471.", flag: "Authority" },
      { who: "you", text: "Oh, hi. What's this about?" },
      { who: "caller", text: "We noticed unusual activity. I need to confirm it's really you.", flag: "Fear" },
      { who: "you", text: "Okay… what do you need?" },
      { who: "caller", text: "I'll send a code — just read it back to me.", flag: "Requests for verification codes" },
      { who: "you", text: "Actually, can you verify yourself with SafeSignal first?" },
      { who: "caller", text: "That's not necessary, we're in a hurry here.", flag: "Urgency" },
      { who: "you", text: "Then I'm going to hang up and call the official number." },
    ] },
  { id: "advanced", label: "Advanced", title: "Urgent account security warning", duration: "~4 min", caller: "\"Fraud Department\"",
    blurb: "A tense warning that your account will be locked unless you act now.",
    script: [
      { who: "caller", text: "This is the fraud department. Your account will be suspended in 15 minutes.", flag: "Urgency" },
      { who: "you", text: "What? Why?" },
      { who: "caller", text: "Someone is porting your number. You could lose your bank access.", flag: "Fear" },
      { who: "you", text: "That's scary. What should I do?" },
      { who: "caller", text: "I'm a senior specialist. Read me the 6-digit code to stop it.", flag: "Authority" },
      { who: "you", text: "I… okay, hold on, let me find it." },
      { who: "caller", text: "Quickly, please. Every second counts.", flag: "Requests for verification codes" },
      { who: "you", text: "Wait — real agents never ask for that. I'm hanging up." },
    ] },
];

export interface Task { id: string; title: string; minutes: number }
export const trainingTasks: Task[] = [
  { id: "verify-agent", title: "Learn how to verify a real T-Mobile agent", minutes: 3 },
  { id: "fake-discounts", title: "Recognize fake discount offers", minutes: 4 },
  { id: "never-otp", title: "Understand why you should never share account OTPs", minutes: 2 },
  { id: "urgency", title: "Practice identifying urgency tactics", minutes: 5 },
  { id: "another-sim", title: "Complete another simulated scam call", minutes: 4 },
];
