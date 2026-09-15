import type { ReactNode } from "react";
import { BlurFade } from "@/components/magicui/blur-fade";
import { cn } from "@/lib/utils";

export function PageCanvas({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative mx-auto max-w-6xl px-4 py-8 md:px-8", className)}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-grid opacity-60" />
      <div className="relative">{children}</div>
    </div>
  );
}

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <BlurFade>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-xl">
          <p className="font-mono text-micro uppercase tracking-kicker text-dim">{kicker}</p>
          <h1 className="mt-2 font-display text-3xl italic tracking-tight md:text-4xl">{title}</h1>
          {description ? (
            <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
    </BlurFade>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-surface px-5 py-10 text-center shadow-[var(--shadow-border)]">
      <p className="font-display text-xl italic">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
