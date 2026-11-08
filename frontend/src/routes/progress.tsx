import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Flame, Heart, PhoneCall, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Mascot } from "@/components/safe/Mascot";
import { useDemo } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useCustomers } from "@/lib/use-customers";
import { CURRENT_CUSTOMER_ID } from "@/lib/mock-data";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/progress")({
  head: () => ({ meta: [{ title: "Your Safety Roadmap — Pinky Promise" }, { name: "description", content: "Follow your personal roadmap to safer calls with Pinky Promise." }, { property: "og:title", content: "Your Safety Roadmap — Pinky Promise" }, { property: "og:description", content: "Celebrate your practice calls and take the next step with Penny." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CallProgress,
});

function CallProgress() {
  const s = useDemo();
  const customer = useCustomers().find((entry) => entry.id === CURRENT_CUSTOMER_ID);
  const skills = Object.entries(customer?.susceptibility ?? {}).sort((a, b) => a[1] - b[1]);
  const strongest = skills[0];
  const focus = skills.at(-1);
  const first = Math.max(1, s.simulations - 1);
  const nodes = Array.from({ length: 5 }, (_, i) => ({ number: first + i, done: first + i <= s.simulations, current: first + i === s.simulations + 1 }));
  return <div className="mx-auto max-w-5xl pb-6">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-extrabold text-primary">ONE SAFE CHOICE AT A TIME</p><h1 className="mt-1 text-3xl font-black">Your safety journey</h1></div>
      <span className="flex items-center gap-1.5 rounded-full bg-peach px-3 py-2 text-sm font-bold text-peach-foreground"><Flame className="size-5 text-peach-foreground" />{s.streak} day streak</span>
    </header>
    <div className="glass-surface mb-6 grid grid-cols-2 divide-x rounded-xl border py-4">
      <div className="flex items-center justify-center gap-2"><PhoneCall className="size-5 text-primary" /><span className="text-xl font-black">{s.simulations}</span><span className="text-xs font-bold text-muted-foreground">calls practiced</span></div>
      <div className="flex items-center justify-center gap-2"><ShieldCheck className="size-5 text-mint-foreground" /><span className="text-xl font-black">{100 - s.vulnerability}%</span><span className="text-xs font-bold text-muted-foreground">awareness</span></div>
    </div>
    <div className="flex flex-col gap-8">
    <section aria-label="Practice call roadmap" className="min-w-0">
      <div className="section-wash flex items-center gap-3 rounded-xl border border-primary/10 px-5 py-4"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Heart className="size-5" /></span><div><h2 className="text-lg font-black">One call braver</h2><p className="text-sm text-muted-foreground">A little practice. A stronger you.</p></div></div>
      <div className="relative mx-auto mt-5 w-full max-w-sm">
        <svg aria-hidden="true" viewBox="0 0 360 650" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" fill="none"><path d="M 180 52 C 180 115 244 98 244 182 S 116 235 116 312 S 244 365 244 442 S 180 500 180 572" stroke="var(--border)" strokeWidth="8" strokeLinecap="round" strokeDasharray="2 15" /></svg>
        {nodes.map((node, i) => {
          const Icon = node.done ? Check : node.current ? PhoneCall : i === 4 ? Heart : Sparkles;
          return <div key={node.number} className={cn("relative flex h-[130px] flex-col items-center justify-start pt-2", i === 1 || i === 3 ? "pl-32" : i === 2 ? "pr-32" : "")}>
            <Button asChild variant="ghost" size="icon" className={cn("size-[76px] shrink-0 rounded-full border-b-[5px] [&_svg]:size-7", node.done ? "border-mint-foreground/30 bg-mint text-mint-foreground hover:bg-mint hover:text-mint-foreground" : node.current ? "border-primary-deep bg-primary text-primary-foreground ring-[6px] ring-pink shadow-pop hover:bg-primary-deep hover:text-primary-foreground" : "border-border bg-card text-primary/50 hover:bg-pink hover:text-primary")}>
              <Link to="/practice" aria-label={node.done ? `Revisit practice call ${node.number}` : node.current ? "Start next practice call" : `Practice toward call ${node.number}`} aria-current={node.current ? "step" : undefined}><Icon strokeWidth={2.5} /></Link>
            </Button>
            <p className={cn("mt-2 text-xs font-extrabold", node.current ? "text-primary" : "text-muted-foreground")}>{node.done ? `Call ${node.number} complete` : node.current ? "Your next call" : `Call ${node.number}`}</p>
            {node.current && <div className={cn("absolute top-0", i === 2 ? "right-3" : "left-3")}><Mascot size={90} mood="float" /></div>}
          </div>;
        })}
      </div>
      <div className="mx-auto max-w-xs text-center"><p className="mb-4 text-sm font-bold">Ready for your next small win?</p><Button asChild variant="hero" size="lg" className="w-full"><Link to="/practice">Let's practice<ArrowRight className="size-4" /></Link></Button>{s.lastResult && <Button asChild variant="link" className="mt-2"><Link to="/results">See your latest call results<ArrowRight className="size-4" /></Link></Button>}</div>
    </section>
    <aside aria-label="Your progress analysis" className="space-y-6 border-t border-primary/15 bg-card/65 px-4 py-6">
      <div><p className="text-xs font-extrabold text-primary">A LITTLE REFLECTION</p><h2 className="mt-1 text-xl font-black">Your safety snapshot</h2><p className="mt-2 text-sm text-muted-foreground">Small insights for your next call.</p></div>
      {strongest && <section className="rounded-xl border-l-4 border-mint-foreground bg-mint px-4 py-3"><p className="flex items-center gap-2 text-xs font-extrabold text-mint-foreground"><ShieldCheck className="size-4" />YOUR STRENGTH</p><h3 className="mt-2 font-black">Resisting {strongest[0].toLowerCase()}</h3><p className="mt-1 text-sm text-mint-foreground">{100 - strongest[1]}% awareness in your practice scores.</p></section>}
      {focus && <section className="rounded-xl border-l-4 border-primary bg-pink px-4 py-3"><p className="flex items-center gap-2 text-xs font-extrabold text-primary"><Sparkles className="size-4" />YOUR NEXT FOCUS</p><h3 className="mt-2 font-black">Spotting {focus[0].toLowerCase()}</h3><p className="mt-1 text-sm text-muted-foreground">Pause before acting on a caller's request. Verify through an official channel.</p></section>}
      <section><h3 className="mb-4 font-black">Scam awareness</h3><div className="space-y-4">{skills.map(([tactic, risk]) => <div key={tactic}><div className="mb-2 flex justify-between gap-2 text-xs font-bold"><span>{tactic}</span><span className="text-muted-foreground">{100 - risk}%</span></div><Progress value={100 - risk} aria-label={`${tactic} awareness`} className="h-1.5" /></div>)}</div></section>
      <section className="border-t pt-4"><h3 className="mb-3 font-black">Latest call</h3>{s.lastResult ? <><p className="text-sm font-bold capitalize">{s.lastResult.difficulty} practice · {100 - s.lastResult.score}/100</p><p className="mt-2 text-sm text-muted-foreground">{s.lastResult.wentWell[0]}</p><Button asChild variant="link" className="mt-2 h-auto px-0"><Link to="/results">View call breakdown<ArrowRight className="size-4" /></Link></Button></> : <p className="text-sm text-muted-foreground">Finish a practice call to get personal feedback here.</p>}</section>
    </aside>
    </div>
    <p className="mt-8 border-t pt-4 text-center text-xs text-muted-foreground">Practice progress. Scores are illustrative.</p>
  </div>;
}