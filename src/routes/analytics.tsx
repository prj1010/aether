import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/app-shell";
import { getOverview, listTraces } from "@/lib/server/aether";
import { useAether } from "@/lib/store";
import { formatMs, formatPct } from "@/lib/utils";

export const Route = createFileRoute("/analytics")({ component: AnalyticsPage });

function AnalyticsPage() {
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => getOverview() });
  const serverTraces = useQuery({ queryKey: ["traces"], queryFn: () => listTraces() });
  const local = useAether((s) => s.traces);
  const stats = overview.data?.stats;
  const metrics = overview.data?.metrics;
  const traces = local.length ? local : (serverTraces.data ?? []);

  const pathMix = [
    { name: "Fast", n: traces.filter((t) => t.plan.path === "fast").length },
    { name: "Deep", n: traces.filter((t) => t.plan.path === "deep").length },
  ];
  const kindMix = ["factual", "semantic", "exact", "multi_hop", "temporal", "memory", "ambiguous"].map(
    (k) => ({ name: k.replace("_", " "), n: traces.filter((t) => t.plan.kind === k).length }),
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-dim">Observability</p>
        <h1 className="mt-2 font-display text-3xl italic">Analytics</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Latency, path mix, and confidence. Document text is never stored in this view.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Documents" value={String(stats?.documents ?? "—")} />
          <Stat label="Chunks" value={String(stats?.chunks ?? "—")} />
          <Stat label="Entities" value={String(stats?.entities ?? "—")} />
          <Stat label="Traces" value={String(traces.length)} />
          <Stat label="p50" value={metrics?.p50 ? formatMs(metrics.p50) : "—"} />
          <Stat label="p95" value={metrics?.p95 ? formatMs(metrics.p95) : "—"} />
          <Stat label="Mean confidence" value={metrics ? formatPct(metrics.meanConfidence) : "—"} />
          <Stat label="LLM share" value={metrics ? formatPct(metrics.llmShare) : "—"} />
        </div>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <ChartCard title="Path mix">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pathMix}>
                <CartesianGrid stroke="rgba(244,244,240,0.06)" vertical={false} />
                <XAxis dataKey="name" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "#121214",
                    border: "1px solid rgba(244,244,240,0.12)",
                    borderRadius: 8,
                    color: "#f4f4f0",
                  }}
                />
                <Bar dataKey="n" fill="#c8ccd4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Query kind">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={kindMix}>
                <CartesianGrid stroke="rgba(244,244,240,0.06)" vertical={false} />
                <XAxis dataKey="name" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "#121214",
                    border: "1px solid rgba(244,244,240,0.12)",
                    borderRadius: 8,
                    color: "#f4f4f0",
                  }}
                />
                <Bar dataKey="n" fill="#a1a1aa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface px-4 py-4 shadow-[var(--shadow-border)]">
      <div className="font-mono text-[10px] uppercase tracking-wider text-dim">{label}</div>
      <div className="mt-2 font-display text-2xl italic tabular-nums">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {children}
    </div>
  );
}
