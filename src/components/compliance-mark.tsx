import { cn } from "@/lib/utils";
import type { FrameworkId } from "@/lib/rag/compliance/types";

export function FrameworkMark({
  id,
  size = 20,
  className,
}: {
  id: FrameworkId;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn("shrink-0 text-accent", className)}
      fill="none"
      aria-hidden
    >
      {id === "eu_ai_act" ? (
        <>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="12" cy="4" r="1.5" className="fill-fg" />
          <circle cx="18.9" cy="8" r="1.4" className="fill-accent" />
          <circle cx="16.5" cy="17.2" r="1.4" className="fill-accent" />
          <circle cx="7.5" cy="17.2" r="1.4" className="fill-accent" />
          <circle cx="5.1" cy="8" r="1.4" className="fill-accent" />
        </>
      ) : id === "nist_ai_rmf" ? (
        <>
          <rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="14" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="4" y="14" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="14" y="14" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="7" cy="7" r="1.2" className="fill-fg" />
          <circle cx="17" cy="7" r="1.2" className="fill-accent" />
          <circle cx="7" cy="17" r="1.2" className="fill-accent" />
          <circle cx="17" cy="17" r="1.2" className="fill-accent" />
        </>
      ) : (
        <>
          <path d="M12 4 L19 8 V14 C19 18 12 21 12 21 C12 21 5 18 5 14 V8 Z" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="12" cy="12" r="1.6" className="fill-fg" />
        </>
      )}
    </svg>
  );
}
