import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mascot } from "@/components/safe/Mascot";
import { PageTitle } from "@/components/safe/AppShell";
import { verificationService } from "@/lib/services";

export const Route = createFileRoute("/verify")({
  head: () => ({ meta: [{ title: "Verify a Caller — Pinky Promise" }, { name: "description", content: "Enter the code your employee provides to check the caller." }, { property: "og:title", content: "Verify a Caller — Pinky Promise" }, { property: "og:description", content: "Check an employee-issued caller code." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Verify,
});
function Verify() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<"verified" | "invalid" | "expired" | null>(null);
  return <div className="mx-auto w-full space-y-5">
    <PageTitle title="Verify a caller" sub="Know who’s on the other end." />
    <div className="grid gap-5">
      <div className="space-y-5">
        <div className="rounded-2xl border border-pink/20 bg-card/80 p-4 shadow-soft">
          <h2 className="text-lg font-bold">A quick check. Peace of mind.</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Ask the caller for their Pinky Promise code, then enter it below to check their identity.</p>
        </div>

        <form className="space-y-4 rounded-3xl border border-pink/15 bg-card p-4 shadow-soft" onSubmit={(e) => { e.preventDefault(); setResult(verificationService.check(code)); }}>
          <label htmlFor="caller-code" className="block text-sm font-bold text-foreground">Code from your employee</label>
          <Input id="caller-code" value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setResult(null); }} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required autoComplete="off" placeholder="0000" className="h-16 bg-card text-center text-3xl font-black tracking-[0.35rem]" />
          <Button variant="hero" size="lg" className="w-full" disabled={code.length !== 4}><ShieldCheck />Check caller</Button>
        </form>

        {result && <section role="status" className={`flex items-start gap-3 rounded-2xl border p-4 ${result === "verified" ? "border-mint-foreground/30 bg-mint/80 text-mint-foreground" : "border-peach-foreground/30 bg-peach/80 text-peach-foreground"}`}>
          {result === "verified" ? <CheckCircle2 className="size-7 shrink-0" /> : <AlertTriangle className="size-7 shrink-0" />}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black">{result === "verified" ? "Caller verified!" : result === "expired" ? "Code expired" : "Caller not verified"}</h2>
            <p className="mt-1 text-sm leading-relaxed">{result === "verified" ? "The employee's code matches this demo session." : result === "expired" ? "Ask the employee for a new code, then check again." : "That code doesn't match an active employee session. Don't share personal information; contact T-Mobile through an official channel."}</p>
          </div>
          {result === "verified" && <Mascot mood="happy" size={60} />}
        </section>}
      </div>

      <aside className="rounded-3xl border border-mint-foreground/15 bg-mint/30 p-4">
        <Mascot mood={result === "verified" ? "loving" : result ? "alert" : "curious"} size={110} className="mx-auto flex" />
        <h2 className="mt-4 text-base font-bold">Penny’s safety check</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">A real caller can wait. Take a moment before sharing anything personal.</p>
        <div className="mt-5 border-t border-mint-foreground/20 pt-4">
          <ShieldCheck className="mb-2 size-5 text-primary" />
          <p className="text-xs leading-relaxed text-muted-foreground">Your passwords and account login codes stay with you. Always.</p>
        </div>
      </aside>
    </div>

    <p className="border-t border-border pt-4 text-sm text-muted-foreground">Never share your password or account login codes. This prototype checks demo codes only.</p>
  </div>;
}
