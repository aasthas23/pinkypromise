import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { AlertTriangle, ChevronRight, Gauge, PhoneCall, ShieldCheck, Users } from "lucide-react";
import { PageTitle } from "@/components/safe/AppShell";
import { riskTone, useCustomers } from "@/lib/use-customers";
import { useDemo } from "@/lib/store";
import { Mascot, MascotBubble } from "@/components/safe/Mascot";
import { AnalystCharts } from "@/components/safe/AnalystCharts";
import { Button } from "@/components/ui/button";
import { TrendingDown, Activity } from "lucide-react";
import { tacticAnalytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/employee/")({
  head: () => ({ meta: [{ title: "Analysts board — Pinky Promise" }, { name: "description", content: "Explore scam tactic susceptibility, vulnerability scores and simulations." }, { property: "og:title", content: "Analysts board — Pinky Promise" }, { property: "og:description", content: "Explore scam tactic susceptibility, vulnerability scores and simulations." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Overview,
});


function Overview() {
  const list = useCustomers();
  const { verification, biweeklyOptIn, callHistory, csvRecords } = useDemo();
  const tactics = tacticAnalytics(list);
  const totalCalls = csvRecords?.length || list.length;
  const latestByCustomer = new Map<string, (typeof csvRecords)[number]>();
  const chronological = [...(csvRecords || [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (const record of chronological) {
    const key = record.userId || record.employeeName.toLowerCase();
    latestByCustomer.set(key, record);
  }
  const latestRecords = Array.from(latestByCustomer.values());
  const avg = latestRecords.length
    ? Math.round(latestRecords.reduce((sum, record) => sum + record.vulnerabilityScore, 0) / latestRecords.length)
    : Math.round(list.reduce((sum, customer) => sum + customer.vulnerability, 0) / Math.max(1, list.length));
  const firstByCustomer = new Map<string, (typeof csvRecords)[number]>();
  for (const record of chronological) {
    const key = record.userId || record.employeeName.toLowerCase();
    if (!firstByCustomer.has(key)) firstByCustomer.set(key, record);
  }
  const startAvg = Array.from(firstByCustomer.values()).length
    ? Math.round(Array.from(firstByCustomer.values()).reduce((sum, record) => sum + record.vulnerabilityScore, 0) / firstByCustomer.size)
    : avg;
  const sims = totalCalls;
  const need = latestRecords.length
    ? latestRecords.filter((record) => record.vulnerabilityScore >= 60).length
    : list.filter((customer) => customer.vulnerability >= 60).length;
  const kpis = [
    { l: "Customers tracked", v: list.length, i: Users, mood: "confident" },
    { l: "Avg. vulnerability", v: avg, i: Gauge, mood: "worried" },
    { l: "Completed simulations", v: sims, i: PhoneCall, mood: "playful" },
    { l: "Need extra practice", v: need, i: AlertTriangle, mood: "focused" },
  ];
  return (
    <div className="space-y-6">
      <PageTitle title="Analysts board" sub="Small signals. Smarter protection."><span className="flex items-center gap-2 rounded-full bg-mint px-3 py-1.5 text-xs font-bold text-mint-foreground"><Activity className="size-3.5" />Live insights</span></PageTitle>
      {verification?.status === "pending" && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Link to="/employee/verify" className="flex items-center gap-3 rounded-md bg-primary p-4 font-bold text-primary-foreground">
            <ShieldCheck className="animate-pulse" /> {verification.customerName} has an active caller code <ChevronRight className="ml-auto" />
          </Link>
        </motion.div>
      )}
      <div className="grid grid-cols-1 gap-4">
        {kpis.map(({ l, v, i: I, mood }, idx) => (
          <div key={l} className={cn("rounded-xl border p-4 shadow-soft sm:p-5", idx === 0 ? "bg-primary text-primary-foreground" : idx === 1 ? "bg-pink text-primary-deep" : idx === 2 ? "bg-mint text-mint-foreground" : "bg-peach text-peach-foreground")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <I className={cn("size-5", idx === 0 ? "text-primary-foreground" : "text-current")} />
                <p className="mt-3 text-4xl font-black">{v}</p>
                <p className="text-sm font-bold opacity-70">{l}</p>
              </div>
              <Mascot mood={mood as any} size={54} className="shrink-0" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-mint-foreground/10 bg-mint/65 p-4"><p className="flex items-center gap-2 font-bold text-mint-foreground"><TrendingDown className="size-5" />Vulnerability down {startAvg - avg} points from first calls</p><Button asChild variant="soft" size="sm"><Link to="/employee/verify"><ShieldCheck />Issue caller code</Link></Button></div>
      <AnalystCharts customers={list} />
      <MascotBubble mood="think" size={65}>{tactics[0]?.tactic ?? "Urgency"} is the biggest focus area. Let’s help customers build stronger instincts.</MascotBubble>
      <section className="grid grid-cols-1 gap-3"><div className="rounded-xl bg-mint p-5"><h2 className="font-black text-mint-foreground">Biweekly call consent</h2><p className="mt-2">Alex Rivera · {biweeklyOptIn ? "Opted in" : "Opted out"}</p></div><div className="rounded-xl bg-peach p-5"><h2 className="font-black text-peach-foreground">New simulation data</h2><p className="mt-2">{totalCalls} calls · {callHistory.filter((r) => r.source === "biweekly").length} biweekly previews</p></div></section>
      <p className="text-xs text-muted-foreground">Sample customers and illustrative scripted scores. No real call behavior is collected.</p>
      <section className="chart-surface overflow-hidden">
        <h2 className="p-5 text-lg font-black">Customers</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr>{["Customer", "Vulnerability", "Simulations", "Awareness", "Last simulation", ""].map((h) => <th key={h} className="px-5 py-3 font-black">{h}</th>)}</tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-t transition-colors hover:bg-blush">
                  <td className="px-5 py-3"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-pink text-xs font-black text-primary-deep">{c.initials}</span><span className="font-bold">{c.name}</span></div></td>
                  <td className="px-5 py-3"><span className={cn("rounded-full px-3 py-1 font-black", riskTone(c.vulnerability))}>{c.vulnerability}</span></td>
                  <td className="px-5 py-3 font-semibold">{c.simulations}</td>
                  <td className="px-5 py-3"><div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${100 - c.vulnerability}%` }} /></div><span className="font-semibold">{100 - c.vulnerability}%</span></div></td>
                  <td className="px-5 py-3 text-muted-foreground">{new Date(c.lastSimulation).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                  <td className="px-5 py-3 text-right"><Link to="/employee/customers/$id" params={{ id: c.id }} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-bold text-primary-deep hover:bg-pink">View <ChevronRight className="size-4" /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
