import { cn } from "@/lib/utils";

export function BrandMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role="img"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="7" className="fill-elevated" />
      <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="text-accent">
        <line x1="9" y1="13" x2="23" y2="13" />
        <line x1="9" y1="13" x2="16" y2="24" />
        <line x1="23" y1="13" x2="16" y2="24" />
        <line x1="16" y1="7" x2="16" y2="13" />
      </g>
      <circle cx="9" cy="13" r="2.2" className="fill-accent" />
      <circle cx="23" cy="13" r="2.2" className="fill-accent" />
      <circle cx="16" cy="24" r="2.2" className="fill-accent" />
      <circle cx="16" cy="7" r="1.7" className="fill-fg" />
    </svg>
  );
}

export function Constellation({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 280 120"
      className={cn("text-accent/70", className)}
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="0.8" opacity="0.55">
        <line x1="40" y1="58" x2="140" y2="28" />
        <line x1="140" y1="28" x2="240" y2="58" />
        <line x1="40" y1="58" x2="140" y2="96" />
        <line x1="240" y1="58" x2="140" y2="96" />
        <line x1="140" y1="28" x2="140" y2="96" />
      </g>
      <circle cx="40" cy="58" r="4" className="fill-accent" />
      <circle cx="240" cy="58" r="4" className="fill-accent" />
      <circle cx="140" cy="96" r="4" className="fill-accent" />
      <circle cx="140" cy="28" r="5" className="fill-fg" />
    </svg>
  );
}
