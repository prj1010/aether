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
import { Badge } from "@/components/ui/badge";
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
  const shards = stats?.shards ?? [];

  const pathMix = [
    { name: "Fast", n: traces.filter((t) => t.plan.path === "fast").length },
    { name: "Deep", n: traces.filter((t) => t.plan.path === "deep").length },
  ];
  const kindMix = ["factual", "semantic", "exact", "multi_hop", "temporal", "memory", "ambiguous"].map(
    (k) => ({ name: k.replace("_", " "), n: traces.filter((t) => t.plan.kind === k).length }),
  );
  const sharded = traces.filter((t) => t.sharding);
  const meanFanout = sharded.length
    ? sharded.reduce((s, t) => s + (t.sharding?.searched.length ?? 0), 0) / sharded.length
    : 0;
  const expandRate = sharded.length
    ? sharded.filter((t) => t.sharding?.expanded).length / sharded.length
    : 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-dim">Observability</p>
        <h1 className="mt-2 font-display text-3xl italic">Analytics</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Latency, path mix, shard fan-out, and confidence. Document text is never stored in this view.
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
          <Stat label="Shards" value={String(shards.length || "—")} />
          <Stat label="Partition" value={stats?.shardMode ?? "—"} />
          <Stat label="Mean fan-out" value={sharded.length ? meanFanout.toFixed(1) : "—"} />
          <Stat label="Expand rate" value={sharded.length ? formatPct(expandRate) : "—"} />
        </div>

        {shards.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-sm font-medium">Collection shards</h2>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Mini-indexes: BM25, embeddings, graph, and provenance per collection. Hash split only
              if a collection grows past the size threshold.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shards.map((s) => (
                <div key={s.id} className="rounded-xl bg-surface px-4 py-4 shadow-[var(--shadow-border)]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-muted">{s.id}</span>
                    <Badge variant={s.status === "healthy" ? "ok" : s.status === "degraded" ? "warn" : "danger"}>
                      {s.status}
                    </Badge>
                  </div>
                  <div className="mt-3 font-display text-xl italic capitalize">{s.domain}</div>
                  <div className="mt-2 font-mono text-[11px] text-dim">
                    {s.docs} doc{s.docs === 1 ? "" : "s"} · {s.chunks} chunk{s.chunks === 1 ? "" : "s"} · health {Math.round(s.health * 100)}%
                  </div>
                  {s.keywords?.length ? (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {s.keywords.slice(0, 5).map((k) => (
                        <Badge key={k}>{k}</Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

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
