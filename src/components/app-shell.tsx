import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  FlaskConical,
  GitBranch,
  Library,
  Menu,
  MessageSquare,
  Layers,
  Radio,
  Scale,
  Settings,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getGeneratorStatus } from "@/lib/server/aether";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Ask", icon: MessageSquare },
  { to: "/knowledge", label: "Knowledge", icon: Library },
  { to: "/inspector", label: "Inspector", icon: GitBranch },
  { to: "/observability", label: "Observability", icon: Radio },
  { to: "/memory", label: "Memory", icon: Layers },
  { to: "/analytics", label: "Analytics", icon: Activity },
  { to: "/eval", label: "Evaluation", icon: FlaskConical },
  { to: "/compliance", label: "Compliance", icon: Scale },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh bg-bg text-fg">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-elevated focus:px-3 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        <aside className="hidden w-[232px] shrink-0 flex-col border-r border-border bg-surface md:flex">
          <Brand />
          <NavList pathname={pathname} onNavigate={() => setOpen(false)} />
          <FooterMark />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center gap-3 border-b border-border px-4 md:hidden">
            <button
              type="button"
              className="grid size-11 place-items-center rounded-md text-muted hover:bg-elevated hover:text-fg"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </button>
            <BrandMark size={22} />
            <span className="font-display text-xl italic">Aether</span>
          </header>

          {open ? (
            <div className="fixed inset-0 z-40 md:hidden">
              <button
                type="button"
                className="absolute inset-0 bg-bg/70"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
              />
              <div className="relative flex h-full w-[min(100%,280px)] flex-col bg-surface shadow-[var(--shadow-border)]">
                <div className="flex items-center justify-between pr-2">
                  <Brand />
                  <button
                    type="button"
                    className="grid size-11 place-items-center text-muted"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <NavList pathname={pathname} onNavigate={() => setOpen(false)} />
                <FooterMark />
              </div>
            </div>
          ) : null}

          <main id="main" className="min-h-0 flex-1">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

function Brand() {
  return (
    <div className="px-5 py-6">
      <Link to="/" className="flex items-center gap-3">
        <BrandMark size={32} />
        <span>
          <span className="block font-display text-2xl leading-none italic tracking-tight">
            Aether
          </span>
          <span className="mt-1.5 block font-mono text-2xs uppercase tracking-kicker text-dim">
            Knowledge engine
          </span>
        </span>
      </Link>
    </div>
  );
}

function NavList({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Primary">
      {NAV.map((item) => {
        const active =
          item.to === "/"
            ? pathname === "/"
            : pathname === item.to || pathname.startsWith(item.to + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150",
              active ? "bg-elevated text-fg" : "text-muted hover:bg-elevated/60 hover:text-fg",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute left-0 h-5 w-px rounded-full",
                active ? "bg-accent" : "bg-transparent",
              )}
            />
            <Icon className="size-4" strokeWidth={1.6} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function FooterMark() {
  const generator = useQuery({ queryKey: ["generator"], queryFn: () => getGeneratorStatus() });
  return (
    <div className="border-t border-border px-5 py-4">
      <div className="font-mono text-2xs uppercase tracking-kicker text-dim">Adaptive compute</div>
      <div className="mt-1 truncate text-xs text-muted">
        {generator.data?.configured ? generator.data.label : "Extractive answers"}
      </div>
    </div>
  );
}
