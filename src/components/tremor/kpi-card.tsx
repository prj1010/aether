import type { ReactNode } from "react";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  hint,
  suffix,
  numeric,
  decimals = 0,
  className,
}: {
  label: string;
  value?: ReactNode;
  hint?: string;
  suffix?: string;
  numeric?: number;
  decimals?: number;
  className?: string;
}) {
  return (
    <Card className={cn("p-4", className)}>
      <p className="font-mono text-2xs uppercase tracking-kicker text-dim">{label}</p>
      <div className="mt-2 flex items-baseline gap-1 font-display text-2xl italic tabular-nums tracking-tight">
        {numeric != null ? <NumberTicker value={numeric} decimalPlaces={decimals} /> : value}
        {suffix ? <span className="font-sans text-sm not-italic text-muted">{suffix}</span> : null}
      </div>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}
