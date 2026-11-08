import { createFileRoute } from "@tanstack/react-router";
import { Bell, Lock, Phone, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Mascot } from "@/components/safe/Mascot";
import { PageTitle } from "@/components/safe/AppShell";
import { resetDemo, useDemo } from "@/lib/store";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — Pinky Promise" }, { name: "description", content: "Your Pinky Promise account, safety preferences and demo settings." }, { property: "og:title", content: "Profile — Pinky Promise" }, { property: "og:description", content: "Your Pinky Promise account, safety preferences and demo settings." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Profile,
});

function Profile() {
  const s = useDemo();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle title="Profile" />
      <section className="flex items-center gap-5 rounded-[2rem] bg-pink p-6">
        <span className="grid size-20 place-items-center rounded-full bg-primary-deep text-3xl font-black text-primary-foreground">A</span>
        <div className="flex-1"><h2 className="text-2xl font-black">Alex Rivera</h2><p className="text-muted-foreground">Magenta MAX · (555) 010-2468</p><p className="mt-1 text-sm font-bold text-primary-deep">Awareness score {100 - s.vulnerability}</p></div>
        <Mascot size={90} className="hidden sm:block" />
      </section>
      <ul className="divide-y rounded-3xl bg-card shadow-soft">
        {[{ i: Bell, t: "Scam alerts", d: "On" }, { i: Phone, t: "Caller verification", d: "Enabled" }, { i: Lock, t: "Privacy", d: "Practice calls are never recorded" }].map(({ i: I, t, d }) => (
          <li key={t} className="flex items-center gap-4 p-5"><I className="size-5 text-primary" /><span className="flex-1 font-bold">{t}</span><span className="text-sm text-muted-foreground">{d}</span></li>
        ))}
      </ul>
      <Button variant="soft" onClick={resetDemo}><RotateCcw /> Reset demo data</Button>
    </div>
  );
}
