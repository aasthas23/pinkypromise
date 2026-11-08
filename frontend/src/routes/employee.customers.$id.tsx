import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Lightbulb, XCircle } from "lucide-react";
import { Area, AreaChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ScoreRing } from "@/components/safe/ScoreRing";
import { customers } from "@/lib/mock-data";
import { riskTone, useCustomers } from "@/lib/use-customers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/employee/customers/$id")({
  head: () => ({ meta: [{ title: "Customer Risk Insights — Pinky Promise" }, { name: "description", content: "Vulnerability trends, tactic susceptibility and recommended interventions." }, { property: "og:title", content: "Customer Risk Insights — Pinky Promise" }, { property: "og:description", content: "Vulnerability trends, tactic susceptibility and recommended interventions." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Insights,
});

function Insights() {
  const { id } = Route.useParams();
  const c = useCustomers().find((x) => x.id === id);
  if (!c) return null;
  const radar = Object.entries(c.susceptibility).map(([k, v]) => ({ tactic: k, value: v }));
  const trend = c.trend.map((v, i) => ({ n: `Sim ${i + 1}`, v }));
  const tips = [
    c.susceptibility.Authority > 50 && "Walk through the employee-issued caller code flow together.",
    c.susceptibility.Urgency > 50 && "Recommend an advanced practice call focused on urgency.",
    c.susceptibility.Rewards > 40 && "Share the “too good to be true” discount checklist.",
    c.simulations < 5 && "Recommend another on-demand practice call.",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <Link to="/employee" className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-bold text-muted-foreground hover:bg-muted"><ArrowLeft className="size-4" /> All customers</Link>
      <section className="flex flex-wrap items-center gap-6 rounded-[2rem] bg-ink p-6 text-ink-foreground md:p-8">
        <span className="grid size-16 place-items-center rounded-full bg-primary text-xl font-black">{c.initials}</span>
        <div className="flex-1"><h1 className="text-3xl font-black">{c.name}</h1><p className="opacity-70">{c.simulations} simulations · {100 - c.vulnerability}% awareness</p></div>
        <ScoreRing value={c.vulnerability} size={110} stroke={10} track="color-mix(in oklab, var(--ink-foreground) 15%, transparent)" label={`Vulnerability ${c.vulnerability}`}>
          <div><p className="text-3xl font-black">{c.vulnerability}</p><p className="text-[10px] font-bold uppercase opacity-60">vulnerability</p></div>
        </ScoreRing>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl bg-card p-6 shadow-soft">
          <h2 className="text-lg font-black">Tactic susceptibility</h2>
          <div className="h-72"><ResponsiveContainer><RadarChart data={radar} outerRadius="72%">
            <PolarGrid stroke="var(--border)" /><PolarAngleAxis dataKey="tactic" tick={{ fill: "var(--muted-foreground)", fontSize: 12, fontWeight: 700 }} />
            <Radar dataKey="value" stroke="var(--primary)" strokeWidth={3} fill="var(--primary)" fillOpacity={0.2} dot={{ r: 4, fill: "var(--primary)" }} />
          </RadarChart></ResponsiveContainer></div>
        </section>
        <section className="rounded-3xl bg-card p-6 shadow-soft">
          <h2 className="text-lg font-black">Vulnerability trend</h2>
          <div className="h-72"><ResponsiveContainer><AreaChart data={trend} margin={{ top: 16, right: 8, left: -20 }}>
            <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
            <XAxis dataKey="n" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
            <Tooltip contentStyle={{ borderRadius: 16, border: "none", boxShadow: "var(--shadow-soft)" }} />
            <Area type="monotone" dataKey="v" name="Vulnerability" stroke="var(--primary)" strokeWidth={3} fill="url(#g)" dot={{ r: 5, fill: "var(--card)", stroke: "var(--primary)", strokeWidth: 3 }} />
          </AreaChart></ResponsiveContainer></div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-3xl bg-card p-6 shadow-soft">
          <h2 className="text-lg font-black">Simulation history</h2>
          <ul className="mt-3 space-y-2">{c.trend.map((v, i) => <li key={i} className="flex items-center justify-between rounded-2xl bg-muted px-4 py-2 font-semibold">Simulation {i + 1}<span className={cn("rounded-full px-2.5 py-0.5 text-sm font-black", riskTone(v))}>{v}</span></li>).reverse()}</ul>
        </section>
        <section className="rounded-3xl bg-card p-6 shadow-soft">
          <h2 className="text-lg font-black">Tactics</h2>
          <ul className="mt-3 space-y-2">
            {c.recognized.map((t) => <li key={t} className="flex items-center gap-2 font-semibold text-mint-foreground"><CheckCircle2 className="size-4" />Recognized: {t}</li>)}
            {c.missed.map((t) => <li key={t} className="flex items-center gap-2 font-semibold text-primary-deep"><XCircle className="size-4" />Missed: {t}</li>)}
            {!c.recognized.length && !c.missed.length && <li className="text-muted-foreground">No tactic data yet.</li>}
          </ul>
          <h3 className="mt-5 text-sm font-black uppercase text-muted-foreground">Transcript summary</h3>
          <p className="mt-1 text-sm">{c.summary}</p>
        </section>
        <section className="rounded-3xl bg-pink p-6">
          <h2 className="flex items-center gap-2 text-lg font-black text-primary-deep"><Lightbulb className="size-5" />Suggested interventions</h2>
          <ol className="mt-3 space-y-2">{(tips.length ? tips : ["Keep it up — invite them to share tips with others."]).map((t, i) => <li key={t} className="flex gap-3 rounded-2xl bg-card p-3 text-sm font-semibold"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-black text-primary-foreground">{i + 1}</span>{t}</li>)}</ol>
        </section>
      </div>
      <p className="text-xs text-muted-foreground">Customer-level data will be role-restricted to authorized employees in production.</p>
    </div>
  );
}
