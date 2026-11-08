import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { tacticAnalytics } from "@/lib/analytics";
import type { Customer } from "@/lib/mock-data";
import { useDemo } from "@/lib/store";

const tones = ["var(--primary)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const tip = { background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 20, boxShadow: "var(--shadow-soft)" };
const tick = { fill: "var(--muted-foreground)", fontSize: 11 };

export function AnalystCharts({ customers }: { customers: Customer[] }) {
  const { csvRecords } = useDemo();
  const [metric, setMetric] = useState<"score" | "affected">("score");
  const tactics = tacticAnalytics(customers).map((t) => ({ ...t, name: t.tactic === "Social engineering" ? "Social eng." : t.tactic }));

  // Build the chronological simulation trend dynamically from all CSV records
  const sortedRecords = [...(csvRecords || [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const trend = sortedRecords.length > 0
    ? sortedRecords.map((r, index) => {
        const subset = sortedRecords.slice(0, index + 1);
        const runningAvg = Math.round(subset.reduce((sum, item) => sum + item.vulnerabilityScore, 0) / subset.length);
        return {
          name: `Call ${index + 1}`,
          risk: runningAvg,
          score: r.vulnerabilityScore,
          count: 1,
        };
      })
    : Array.from({ length: Math.max(0, ...customers.map((c) => c.trend.length)) }, (_, index) => {
        const values = customers.flatMap((c) => (c.trend[index] === undefined ? [] : [c.trend[index]]));
        return {
          name: `Call ${index + 1}`,
          risk: Math.round(values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)),
          count: values.length,
        };
      });

  const groups = [
    { name: "Low risk", value: customers.filter((c) => c.vulnerability < 34).length, color: "var(--chart-2)" },
    { name: "Moderate", value: customers.filter((c) => c.vulnerability >= 34 && c.vulnerability < 60).length, color: "var(--chart-3)" },
    { name: "High risk", value: customers.filter((c) => c.vulnerability >= 60).length, color: "var(--primary)" },
  ];
  return <div className="space-y-6">
    <section className="chart-surface border-t-4 border-t-primary p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">The anatomy of a scam</h2><p className="text-sm text-muted-foreground">Tactics that influence your customers</p></div><div className="flex gap-1 rounded-lg bg-muted p-1" aria-label="Tactic metric">{(["score", "affected"] as const).map((m) => <Button key={m} size="sm" variant={metric === m ? "default" : "ghost"} onClick={() => setMetric(m)} aria-pressed={metric === m}>{m === "score" ? "Susceptibility" : "Higher-risk users"}</Button>)}</div></div>
      <div className="h-72 w-full min-w-0" role="img" aria-label={`Scam tactic ${metric === "score" ? "susceptibility" : "higher-risk customer counts"}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={tactics} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}><CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 5" /><XAxis type="number" domain={metric === "score" ? [0, 100] : [0, customers.length]} allowDecimals={false} axisLine={false} tickLine={false} tick={tick} /><YAxis dataKey="name" type="category" width={82} axisLine={false} tickLine={false} tick={tick} /><Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={tip} /><Bar dataKey={metric} name={metric === "score" ? "Susceptibility / 100" : "Higher-risk customers"} barSize={22} radius={[0, 11, 11, 0]}>{tactics.map((t, i) => <Cell key={t.tactic} fill={tones[i]} />)}</Bar></BarChart></ResponsiveContainer></div>
    </section>
    <div className="grid grid-cols-1 gap-7">
      <section className="chart-surface min-w-0 border-t-4 border-t-mint-foreground p-4 sm:p-6"><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black">Getting safer, call by call</h2><p className="text-sm text-muted-foreground">Mean vulnerability by simulation number</p></div><span className="rounded-lg bg-mint px-3 py-1 text-xs font-bold text-mint-foreground">Lower is better</span></div><div className="mt-5 h-64" role="img" aria-label="Average vulnerability trend"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ left: -25, right: 8, top: 8, bottom: 0 }}><defs><linearGradient id="analyst-risk-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={tick} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={tick} /><Tooltip contentStyle={tip} /><Area type="monotone" dataKey="risk" name="Avg. vulnerability" stroke="var(--mint-foreground)" strokeWidth={3} fill="url(#analyst-risk-fill)" dot={{ r: 4, fill: "var(--card)", strokeWidth: 2 }} /></AreaChart></ResponsiveContainer></div><p className="text-xs text-muted-foreground">Each point includes simulation calls up to that call number.</p></section>
      <section className="chart-surface min-w-0 border-t-4 border-t-peach-foreground p-4 sm:p-6"><h2 className="text-xl font-black">Who needs a little help?</h2><p className="text-sm text-muted-foreground">Customer risk distribution</p><div className="relative mx-auto h-56 max-w-xs" role="img" aria-label="Customer risk distribution"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={groups} dataKey="value" innerRadius={67} outerRadius={90} paddingAngle={5} stroke="none">{groups.map((g) => <Cell key={g.name} fill={g.color} />)}</Pie><Tooltip contentStyle={tip} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-4xl font-black">{customers.length}</span><span className="text-xs font-bold text-muted-foreground">customers</span></div></div><div className="space-y-2">{groups.map((g) => <div key={g.name} className="flex items-center gap-2 text-sm"><span className="size-2.5 rounded-full" style={{ background: g.color }} /><span className="flex-1 text-muted-foreground">{g.name}</span><span className="font-black">{g.value}</span></div>)}</div></section>
    </div>
  </div>;
}
