import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  FlaskConical,
  GitBranch,
  Library,
  Menu,
  MessageSquare,
  Layers,
  Settings,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Ask", icon: MessageSquare },
  { to: "/knowledge", label: "Knowledge", icon: Library },
  { to: "/inspector", label: "Inspector", icon: GitBranch },
  { to: "/memory", label: "Memory", icon: Layers },
  { to: "/analytics", label: "Analytics", icon: Activity },
  { to: "/eval", label: "Evaluation", icon: FlaskConical },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-bg text-fg">
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

        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="px-5 py-6">
      <Link to="/" className="block">
        <div className="font-display text-[28px] leading-none italic tracking-tight">Aether</div>
        <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-dim">
          Knowledge engine
        </div>
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
    <nav className="flex flex-1 flex-col gap-0.5 px-3">
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
            className={cn(
              "flex h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150",
              active ? "bg-elevated text-fg" : "text-muted hover:bg-elevated/60 hover:text-fg",
            )}
          >
            <Icon className="size-4" strokeWidth={1.6} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function FooterMark() {
  return (
    <div className="px-5 py-4 font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
      Adaptive compute
    </div>
  );
}
