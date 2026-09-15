import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Magic UI ShineBorder — hover-only, token colors, reduced-motion safe. */
export function ShineBorder({
  className,
  duration = 12,
  borderWidth = 1,
}: {
  className?: string;
  duration?: number;
  borderWidth?: number;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-200",
        "group-hover:opacity-100 motion-reduce:hidden",
        className,
      )}
    >
      <div
        className="absolute inset-0 rounded-[inherit] motion-safe:animate-shine-border"
        style={
          {
            padding: borderWidth,
            animationDuration: `${duration}s`,
            backgroundImage:
              "radial-gradient(transparent, transparent, color-mix(in oklab, var(--color-accent) 70%, transparent), transparent, transparent)",
            backgroundSize: "300% 300%",
            WebkitMask:
              "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          } as CSSProperties
        }
      />
    </div>
  );
}
