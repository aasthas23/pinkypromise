import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Heart, PhoneCall, ShieldCheck, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Mascot } from "@/components/safe/Mascot";
import { useDemo } from "@/lib/store";
export const Route = createFileRoute("/")({
 head: () => ({ meta: [{ title: "Pinky Promise — Your Call Safety Companion" }, { name: "description", content: "Check callers, practice scam calls, and track your confidence with Pinky Promise." }, { property: "og:title", content: "Pinky Promise — Your Call Safety Companion" }, { property: "og:description", content: "Your personal guide to safer calls." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: Home,
});
function Home() {
 const s = useDemo();
 return <div className="space-y-5">
  <section className="-mx-4 rounded-b-[28px] border-b border-pink bg-pink/65 px-4 pb-6 pt-5 shadow-soft">
    <p className="flex items-center gap-2 text-sm font-bold text-primary"><Heart className="size-4" />Hey, Alex. Penny’s got your back.</p>
    <h1 className="mt-2 text-3xl font-extrabold">Pinky Promise</h1>
    <div className="mt-4 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-2xl font-bold leading-tight">Big heart.<br />Sharper instincts.</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">A familiar voice isn’t always a friendly one. Let’s check together.</p>
      </div>
      <div className="flex items-end justify-center self-end pr-1 pt-2">
        <Mascot mood="happy" size={150} className="shrink-0 max-sm:max-w-28" />
      </div>
    </div>
    <Button asChild variant="hero" size="lg" className="mt-5 w-full"><Link to="/verify">Verify a caller<ArrowRight /></Link></Button>
  </section>

  <section className="space-y-3">
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-lg font-bold">Your safety at a glance</h2>
      <Button asChild variant="soft" size="icon" aria-label="View progress"><Link to="/progress"><ArrowRight /></Link></Button>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl border border-mint-foreground/15 bg-mint/85 p-4 shadow-soft">
        <span className="mb-4 grid size-9 place-items-center rounded-full bg-card/70 text-mint-foreground"><ShieldCheck className="size-4" /></span>
        <p className="text-3xl font-black text-mint-foreground">{100-s.vulnerability}<span className="text-base">%</span></p>
        <p className="mt-2 text-sm font-bold text-mint-foreground">Scam awareness</p>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-card/70"><div className="h-full rounded-full bg-mint-foreground" style={{width: `${100-s.vulnerability}%`}} /></div>
      </div>
      <div className="rounded-2xl border border-peach-foreground/15 bg-peach/85 p-4 shadow-soft">
        <span className="mb-4 grid size-9 place-items-center rounded-full bg-card/70 text-peach-foreground"><PhoneCall className="size-4" /></span>
        <p className="text-3xl font-black text-peach-foreground">{s.simulations}</p>
        <p className="mt-2 text-sm font-bold text-peach-foreground">Calls practiced</p>
        <p className="mt-4 text-[11px] font-bold text-peach-foreground">One call braver ♥</p>
      </div>
    </div>
  </section>

  <section className="rounded-[26px] border border-mint-foreground/10 bg-mint/35 p-4">
    <h2 className="text-lg font-black">Keep your instincts sharp</h2>
    <div className="mt-4 flex flex-col gap-3">
      <Button asChild variant="hero" className="w-full"><Link to="/practice"><PhoneCall />Practice a call</Link></Button>
      <Button asChild variant="soft" className="w-full"><Link to="/progress"><TrendingUp />My progress</Link></Button>
    </div>
    <p className="mt-4 text-sm text-muted-foreground">Biweekly simulation calls: <b className="text-foreground">{s.biweeklyOptIn ? "Opted in" : "Opted out"}</b></p>
  </section>
 </div>;
}
