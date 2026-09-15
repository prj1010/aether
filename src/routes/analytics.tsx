import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { CollectionGlyph } from "@/components/collection-mark";
import { BlurFade } from "@/components/magicui/blur-fade";
import { PageCanvas, PageHeader } from "@/components/page-header";
import { Tile, TileHint, TileMeta, TileTitle } from "@/components/tile";
import { BarChart, ChartCard } from "@/components/tremor/bar-chart";
import { KpiCard } from "@/components/tremor/kpi-card";
import { Tracker } from "@/components/tremor/tracker";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getOverview, listTraces } from "@/lib/server/aether";
import type { CollectionId } from "@/lib/rag/types";
import { useAether } from "@/lib/store";
import { formatMs, formatPct } from "@/lib/utils";

export const Route = createFileRoute("/analytics")({ component: AnalyticsPage });

function isCollection(id: string): id is CollectionId {
  return ["policy", "architecture", "people", "security", "product", "operations"].includes(id);
}

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

  const shardFanouts = traces.map((t) => t.sharding?.searched.length ?? 0).filter((n) => n > 0);
  const meanFanout = shardFanouts.length
    ? shardFanouts.reduce((a, b) => a + b, 0) / shardFanouts.length
    : 0;
  const expandRate = traces.length
    ? traces.filter((t) => t.sharding?.expanded).length / traces.length
    : 0;

  const tracker = (stats?.shards ?? []).map((s) => ({
    key: s.id,
    color:
      s.status === "healthy"
        ? "bg-ok"
        : s.status === "degraded"
          ? "bg-warn"
          : s.status === "offline"
            ? "bg-danger"
            : "bg-subtle",
    tooltip: `${s.id} · ${s.status} · ${s.docs} docs`,
  }));

  return (
    <AppShell>
      <PageCanvas>
        <PageHeader
          kicker="Observability"
          title="Analytics"
          description="Latency, path mix, shard fan-out, and confidence. Document text is never stored in this view."
        />

        {overview.isLoading ? (
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : overview.isError ? (
          <Tile className="mt-8 p-6">
            <p className="text-sm text-danger">Could not load analytics.</p>
          </Tile>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard label="Documents" numeric={stats?.documents ?? 0} />
              <KpiCard label="Chunks" numeric={stats?.chunks ?? 0} />
              <KpiCard label="Entities" numeric={stats?.entities ?? 0} />
              <KpiCard label="Traces" numeric={traces.length} />
              <KpiCard label="p50" value={metrics?.p50 ? formatMs(metrics.p50) : "—"} />
              <KpiCard label="p95" value={metrics?.p95 ? formatMs(metrics.p95) : "—"} />
              <KpiCard
                label="Mean confidence"
                value={metrics ? formatPct(metrics.meanConfidence) : "—"}
              />
              <KpiCard label="LLM share" value={metrics ? formatPct(metrics.llmShare) : "—"} />
              <KpiCard label="Shards" numeric={stats?.shards?.length ?? 0} hint={stats?.shardMode} />
              <KpiCard label="Partition" value={stats?.shardMode ?? "—"} />
              <KpiCard label="Mean fan-out" value={meanFanout ? meanFanout.toFixed(1) : "—"} />
              <KpiCard label="Expand rate" value={formatPct(expandRate)} />
            </div>

            {tracker.length > 0 ? (
              <BlurFade className="mt-8">
                <Card>
                  <CardHeader>
                    <CardTitle>Shard health</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tracker data={tracker} />
                    <p className="mt-3 font-mono text-2xs text-dim">
                      One block per collection mini-index. Hover for status.
                    </p>
                  </CardContent>
                </Card>
              </BlurFade>
            ) : null}

            <div className="mt-8 grid gap-3 md:grid-cols-2">
              <ChartCard title="Path mix">
                <BarChart data={pathMix} index="name" categories={["n"]} />
              </ChartCard>
              <ChartCard title="Query kind">
                <BarChart data={kindMix} index="name" categories={["n"]} />
              </ChartCard>
            </div>

            {stats?.shards?.length ? (
              <section className="mt-10">
                <h2 className="text-sm font-medium">Collection shards</h2>
                <p className="mt-1 max-w-xl text-sm text-muted">
                  Mini-indexes: BM25, embeddings, graph, and provenance per collection. Hash split
                  only if a collection grows past the size threshold.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {stats.shards.map((s) => (
                    <Tile key={s.id} className="min-h-32">
                      <div className="flex items-center justify-between gap-2">
                        {isCollection(s.domain) ? (
                          <CollectionGlyph id={s.domain} />
                        ) : (
                          <span className="font-mono text-micro text-fg">{s.id}</span>
                        )}
                        <Badge variant={s.status === "healthy" ? "ok" : "warn"}>{s.status}</Badge>
                      </div>
                      <TileTitle className="mt-4 capitalize">{s.domain}</TileTitle>
                      <TileHint className="font-mono">
                        {s.docs} {s.docs === 1 ? "doc" : "docs"} · {s.chunks}{" "}
                        {s.chunks === 1 ? "chunk" : "chunks"} · health {formatPct(s.health)}
                      </TileHint>
                      {s.keywords?.length ? (
                        <TileMeta className="line-clamp-2">{s.keywords.slice(0, 5).join(" · ")}</TileMeta>
                      ) : null}
                    </Tile>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </PageCanvas>
    </AppShell>
  );
}
