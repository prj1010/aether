"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

export function BarChart({
  data,
  index,
  categories,
  className,
  colors,
}: {
  data: Record<string, string | number>[];
  index: string;
  categories: string[];
  className?: string;
  colors?: string[];
}) {
  const fills = colors ?? ["var(--color-accent)", "var(--color-muted)"];
  return (
    <div className={cn("h-56 w-full", className)} tremor-id="tremor-raw">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart data={data} barCategoryGap="28%">
          <CartesianGrid
            stroke="color-mix(in oklab, var(--color-fg) 8%, transparent)"
            vertical={false}
          />
          <XAxis
            dataKey={index}
            stroke="var(--color-dim)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="var(--color-dim)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={28}
          />
          <Tooltip
            cursor={{ fill: "color-mix(in oklab, var(--color-fg) 4%, transparent)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-md bg-elevated px-3 py-2 text-xs text-fg shadow-[var(--shadow-border)]">
                  <div className="mb-1 font-medium">{String(label)}</div>
                  {payload.map((p) => (
                    <div key={String(p.dataKey)} className="text-muted">
                      {p.name}: <span className="tabular-nums text-fg">{String(p.value)}</span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          {categories.map((cat, i) => (
            <Bar
              key={cat}
              dataKey={cat}
              name={cat}
              fill={fills[i % fills.length]}
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
            />
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {children}
    </div>
  );
}
