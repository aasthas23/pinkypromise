import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { TrendingUp, Home, LayoutDashboard, Menu, PhoneCall, ShieldCheck, User, Users, BarChart3 } from "lucide-react";
import { useEffect } from "react";
import { hydrateDemo, useDemo } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import promiseLogo from "@/assets/pinky-promise-emblem-logo.png";

const customerNav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/verify", label: "Verify", icon: ShieldCheck },
  { to: "/practice", label: "Practice", icon: PhoneCall },
  { to: "/progress", label: "Progress", icon: TrendingUp },
  { to: "/profile", label: "Profile", icon: User },
] as const;

const employeeNav = [
  { to: "/employee", label: "Analysts board", icon: LayoutDashboard },
  { to: "/employee/verify", label: "Caller codes", icon: ShieldCheck },
  { to: "/employer-dashboard", label: "Analytics", icon: BarChart3 },
] as const;

export function Brand() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2">
      <img src={promiseLogo} alt="" width={48} height={48} className="size-12 object-contain" />
      <span className="text-base font-extrabold sm:text-xl">Pinky<span className="block text-primary sm:ml-1 sm:inline">Promise</span></span>
    </Link>
  );
}

function RoleSwitch({ employee }: { employee: boolean }) {
  const navigate = useNavigate();
  const { verification } = useDemo();
  const pending = verification?.status === "pending";
  return (
    <div role="radiogroup" aria-label="Demo view" className="relative flex rounded-full bg-pink/65 p-1 text-xs font-bold sm:text-sm">
      {(["Customer", "Employee"] as const).map((r) => {
        const active = (r === "Employee") === employee;
        return (
          <Button variant="ghost" key={r} role="radio" aria-checked={active} onClick={() => navigate({ to: r === "Employee" ? "/employee" : "/" })}
            className={cn("relative z-10 h-8 px-3 py-1.5 transition-colors hover:bg-transparent", active ? "text-primary hover:text-primary" : "text-muted-foreground hover:text-foreground")}>
            {active && <motion.span layoutId="role-pill" className="absolute inset-0 -z-10 rounded-full bg-card shadow-soft" />}
            <span>{r}</span>
            {r === "Employee" && pending && !employee && <span className="absolute -right-0.5 -top-0.5 size-2.5 animate-pulse rounded-full bg-primary ring-2 ring-background" />}
          </Button>
        );
      })}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  useEffect(() => hydrateDemo(), []);
  const employee = pathname.startsWith("/employee") || pathname.startsWith("/employer-dashboard");
  const nav = employee ? employeeNav : customerNav;
  const isActive = (to: string) => (to === "/" || to === "/employee" ? pathname === to : pathname.startsWith(to));

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#f7edf6] p-3">
      <div className="mx-auto flex h-[calc(100vh-1.5rem)] w-full max-w-[390px] flex-col overflow-hidden rounded-[2.4rem] border border-[#f2d9eb] bg-background shadow-[0_18px_50px_rgba(70,24,52,0.12)]">
        <div className="pointer-events-none absolute left-1/2 top-4 h-2.5 w-28 -translate-x-1/2 rounded-full bg-[#1e1a1d]" />

        <header className="glass-surface z-20 shrink-0 border-b">
          <div className="flex h-16 w-full items-center gap-2 px-3">
            <Button variant="ghost" size="icon" aria-label="Open menu" className="size-9 shrink-0 rounded-full text-muted-foreground hover:bg-muted">
              <Menu className="size-4" />
            </Button>

            <div className="flex min-w-0 flex-1 items-center justify-center">
              <RoleSwitch employee={employee} />
            </div>

            <Link to="/profile" aria-label="Go to profile" className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-primary-deep text-sm font-black text-primary-foreground transition-colors hover:bg-primary-deep/90", pathname === "/profile" && "ring-2 ring-primary/50")}>
              {employee ? <Users className="size-4" /> : <User className="size-4" />}
            </Link>
          </div>
        </header>

        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          <main className="min-h-0 w-full flex-1 overflow-y-auto overscroll-none px-4 pb-24 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <AnimatePresence mode="wait">
              <motion.div key={pathname} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="w-full">
                {children}
              </motion.div>
            </AnimatePresence>
          </main>

          <nav aria-label="Main mobile" className="glass-surface z-20 shrink-0 w-full border-t p-2">
            <div className="flex w-full justify-around gap-1">
              {nav.map(({ to, label, icon: Icon }) => (
                <Link key={to} to={to} aria-current={isActive(to) ? "page" : undefined} className={cn("relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-bold transition-colors", isActive(to) ? "bg-pink text-primary" : "text-muted-foreground hover:bg-muted")}>
                  <Icon className="size-4" />{label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}

export function PageTitle({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-3xl font-black md:text-4xl">{title}</h1>{sub && <p className="mt-1 text-muted-foreground">{sub}</p>}</div>
      {children}
    </div>
  );
}
