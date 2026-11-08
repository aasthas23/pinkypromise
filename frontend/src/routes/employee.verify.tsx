import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Search, Send, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MascotBubble } from "@/components/safe/Mascot";
import { PageTitle } from "@/components/safe/AppShell";
import { useDemo } from "@/lib/store";
import { verificationService } from "@/lib/services";
import { useCountdown } from "@/lib/use-countdown";
export const Route = createFileRoute("/employee/verify")({
  head: () => ({ meta: [{ title: "Employee Caller Codes — Pinky Promise" }, { name: "description", content: "Issue caller codes for customers to check in Pinky Promise." }, { property: "og:title", content: "Employee Caller Codes — Pinky Promise" }, { property: "og:description", content: "Generate a demo code for your customer." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CallerCodes,
});
function CallerCodes() {
  const { verification: v } = useDemo();
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const matches = verificationService.findCustomers(query);
  const selected = selectedId ? verificationService.findCustomers(selectedId).find((customer) => customer.id === selectedId) : undefined;
  const session = selected && v?.customerId === selected.id ? v : null;
  const secs = useCountdown(v?.expiresAt);
  useEffect(() => { if (v?.status === "pending" && secs === 0) verificationService.expire(); }, [secs, v?.status]);
  const generate = async () => {
    if (!selected) return;
    setLoading(true); setError("");
    try { await verificationService.generate(selected.id); }
    catch { setError("Couldn't send the demo code. Please try again."); }
    finally { setLoading(false); }
  };
  return <div className="mx-auto max-w-lg space-y-6">
    <PageTitle title="Caller codes" />
    <MascotBubble mood="wave" size={90}>Let's find the right customer before sending their caller code.</MascotBubble>
    <div className="space-y-3">
      <label htmlFor="customer-search" className="block font-bold">Customer name or ID</label>
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-5 text-muted-foreground" /><Input id="customer-search" className="pl-10" placeholder="Enter name or customer ID" value={query} disabled={loading} onChange={(event) => { setQuery(event.target.value); setSelectedId(null); setError(""); }} autoComplete="off" /></div>
      {query.trim() && !selected && <div className="space-y-2" aria-label="Customer search results">
        {matches.map((customer) => <Button key={customer.id} variant="outline" className="h-auto w-full justify-start gap-3 py-3 text-left" onClick={() => setSelectedId(customer.id)}><UserRound className="size-5 shrink-0" /><span className="min-w-0"><span className="block whitespace-normal font-bold">{customer.name}</span><span className="block text-xs text-muted-foreground">ID: {customer.id}</span></span></Button>)}
        {matches.length === 0 && <p role="status" className="text-sm text-muted-foreground">No customer found. Check the name or ID.</p>}
      </div>}
    </div>
    <section className="space-y-5 border-y py-6">
      <div><p className="text-sm text-muted-foreground">Selected customer</p><h2 className="text-xl font-black">{selected?.name ?? "No customer selected"}</h2>{selected && <p className="text-sm text-muted-foreground">ID: {selected.id}</p>}</div>
      {session && <><p className="rounded-xl bg-pink py-6 text-center text-5xl font-black text-primary-deep" aria-label={`Employee code ${session.code}`}>{session.code}</p>
        <p role="status" className="text-center text-sm text-muted-foreground">Demo code sent to {session.customerName}.</p>
        <p className="text-center font-bold">{session.status === "pending" ? `Waiting for customer · ${secs}s remaining` : session.status === "verified" ? "Customer verified your code" : "Code expired — issue a new one"}</p>
        {session.status === "verified" && <p role="status" className="flex items-center justify-center gap-2 text-mint-foreground"><CheckCircle2 />Caller verification complete</p>}</>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button variant="hero" size="lg" className="w-full" onClick={generate} disabled={loading || !selected}><Send />{loading ? "Sending code…" : session ? "Generate & send new code" : "Generate & send code"}</Button>
    </section>
    <p className="text-xs text-muted-foreground">Demo delivery only. No text messages or notifications are sent. Real employee identity checks are not connected.</p>
  </div>;
}
