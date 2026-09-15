import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { BorderBeam } from "@/components/magicui/border-beam";
import { ShineBorder } from "@/components/magicui/shine-border";
import { cn } from "@/lib/utils";

const surface =
  "relative flex w-full flex-col overflow-hidden rounded-xl bg-surface p-4 text-left text-fg shadow-[var(--shadow-border)] transition-[box-shadow] duration-150 ease-out";

export function Tile({
  selected,
  beam,
  shine,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  selected?: boolean;
  beam?: boolean;
  shine?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(surface, selected && "bg-elevated shadow-[var(--shadow-border-hover)]", className)}
      {...props}
    >
      {beam || selected ? <BorderBeam size={40} duration={10} /> : null}
      {shine ? <ShineBorder /> : null}
      {children}
    </div>
  );
}

export function TileButton({
  selected,
  beam,
  shine = true,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  beam?: boolean;
  shine?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected || undefined}
      className={cn(
        "group",
        surface,
        "hover:shadow-[var(--shadow-border-hover)] active:scale-[0.995]",
        selected && "bg-elevated shadow-[var(--shadow-border-hover)]",
        className,
      )}
      {...props}
    >
      {beam || selected ? <BorderBeam size={40} duration={10} /> : null}
      {shine ? <ShineBorder /> : null}
      {children}
    </button>
  );
}

export function TileKicker({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("font-mono text-2xs uppercase tracking-kicker text-dim", className)}
      {...props}
    />
  );
}

export function TileTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm font-medium text-fg", className)} {...props} />;
}

export function TileHint({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-xs leading-relaxed text-dim", className)} {...props} />;
}

export function TileMeta({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("mt-auto pt-3 font-mono text-2xs text-dim", className)}
      {...props}
    />
  );
}
