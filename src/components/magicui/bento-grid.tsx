import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BentoGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "grid auto-rows-auto grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
      {...props}
    />
  );
}

export function BentoCard({
  className,
  name,
  description,
  icon,
  header,
  children,
  onClick,
  href,
}: {
  className?: string;
  name: string;
  description?: string;
  icon?: ReactNode;
  header?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      {header}
      <div className="relative z-10 flex h-full flex-col justify-end">
        {icon ? <div className="mb-3 text-muted">{icon}</div> : null}
        <div className="text-sm font-medium text-fg">{name}</div>
        {description ? (
          <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
        ) : null}
        {children}
      </div>
    </>
  );

  const shared = cn(
    "group relative flex min-h-36 flex-col overflow-hidden rounded-xl bg-surface p-5 text-left shadow-[var(--shadow-border)]",
    "transition-[box-shadow,transform] duration-150 ease-out",
    onClick || href ? "hover:shadow-[var(--shadow-border-hover)] active:scale-[0.99]" : "",
    className,
  );

  if (href) {
    return (
      <a href={href} className={shared}>
        {inner}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={shared}>
        {inner}
      </button>
    );
  }
  return <div className={shared}>{inner}</div>;
}
