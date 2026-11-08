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
    <header className="mb-5 flex items-center justify-between gap-3">
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Safety track</p>
        <h1 className="mt-1 text-3xl font-black">Progress</h1>
      </div>
      <span className="flex items-center gap-1.5 rounded-full bg-peach px-3 py-2 text-sm font-bold text-peach-foreground"><Flame className="size-4" />{s.streak}d</span>
    </header>

    <div className="glass-surface mb-6 grid grid-cols-2 divide-x rounded-2xl border py-3">
      <div className="flex items-center justify-center gap-2"><PhoneCall className="size-4 text-primary" /><span className="text-xl font-black">{s.simulations}</span><span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">calls</span></div>
      <div className="flex items-center justify-center gap-2"><ShieldCheck className="size-4 text-mint-foreground" /><span className="text-xl font-black">{100 - s.vulnerability}%</span><span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">aware</span></div>
    </div>

    <section aria-label="Practice call roadmap" className="min-w-0">
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-card/80 px-3 py-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground"><Heart className="size-4" /></span>
          <div>
            <p className="text-sm font-black">Next step</p>
            <p className="text-xs text-muted-foreground">Keep it simple</p>
          </div>
        </div>
        <Button asChild variant="hero" size="sm">
          <Link to="/practice">Practice</Link>
        </Button>
      </div>

      <div className="relative mx-auto mt-4 w-full max-w-sm">
        <svg aria-hidden="true" viewBox="0 0 360 650" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" fill="none"><path d="M 180 52 C 180 115 244 98 244 182 S 116 235 116 312 S 244 365 244 442 S 180 500 180 572" stroke="var(--border)" strokeWidth="8" strokeLinecap="round" strokeDasharray="2 15" /></svg>
        {nodes.map((node, i) => {
          const Icon = node.done ? Check : node.current ? PhoneCall : i === 4 ? Heart : Sparkles;
          return <div key={node.number} className={cn("relative flex h-[120px] flex-col items-center justify-start pt-2", i === 1 || i === 3 ? "pl-32" : i === 2 ? "pr-32" : "")}>
            <Button asChild variant="ghost" size="icon" className={cn("size-[68px] shrink-0 rounded-full border-b-[4px] [&_svg]:size-6", node.done ? "border-mint-foreground/30 bg-mint text-mint-foreground" : node.current ? "border-primary-deep bg-primary text-primary-foreground ring-[5px] ring-pink shadow-pop" : "border-border bg-card text-primary/50")}>
              <Link to="/practice" aria-label={node.done ? `Review call ${node.number}` : node.current ? "Start next practice call" : `Practice call ${node.number}`} aria-current={node.current ? "step" : undefined}><Icon strokeWidth={2.5} /></Link>
            </Button>
            <p className={cn("mt-2 text-[10px] font-extrabold uppercase tracking-[0.12em]", node.current ? "text-primary" : "text-muted-foreground")}>{node.done ? `Call ${node.number}` : node.current ? "Next" : `Step ${node.number}`}</p>
            {node.current && <div className={cn("absolute top-0", i === 2 ? "right-3" : "left-3")}><Mascot size={80} mood="float" /></div>}
          </div>;
        })}
      </div>
    </section>

    <aside aria-label="Your progress analysis" className="mt-6 space-y-4 border-t border-primary/15 bg-card/65 px-3 py-4">
      {strongest && <section className="rounded-2xl border-l-4 border-mint-foreground bg-mint px-3 py-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-mint-foreground">Strength</p><h3 className="mt-1 font-black">{strongest[0]}</h3><p className="text-sm text-mint-foreground">{100 - strongest[1]}% aware</p></section>}
      {focus && <section className="rounded-2xl border-l-4 border-primary bg-pink px-3 py-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-primary">Focus</p><h3 className="mt-1 font-black">{focus[0]}</h3><p className="text-sm text-muted-foreground">Verify first</p></section>}

      <section>
        <h3 className="mb-3 text-sm font-black uppercase tracking-[0.12em] text-muted-foreground">Awareness</h3>
        <div className="space-y-3">{skills.map(([tactic, risk]) => <div key={tactic}><div className="mb-1 flex items-center justify-between text-xs"><span className="font-bold">{tactic}</span><span className="text-muted-foreground">{100 - risk}%</span></div><Progress value={100 - risk} aria-label={`${tactic} awareness`} className="h-1.5" /></div>)}</div>
      </section>

      <section className="border-t pt-3">
        <h3 className="mb-2 text-sm font-black uppercase tracking-[0.12em] text-muted-foreground">Latest</h3>
        {s.lastResult ? <><p className="text-sm font-bold capitalize">{s.lastResult.difficulty} · {100 - s.lastResult.score}%</p><Button asChild variant="link" className="mt-1 h-auto px-0"><Link to="/results">View details<ArrowRight className="size-4" /></Link></Button></> : <p className="text-sm text-muted-foreground">No call yet.</p>}
      </section>
    </aside>
  </div>;
}