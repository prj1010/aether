import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { BlurFade } from "@/components/magicui/blur-fade";
import { PageCanvas, PageHeader } from "@/components/page-header";
import { Tile, TileButton, TileHint, TileMeta, TileTitle } from "@/components/tile";
import { KpiCard } from "@/components/tremor/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getOtel } from "@/lib/server/aether";
import type { OtelTraceView } from "@/lib/otel/sdk";
import { cn, formatMs, shortId } from "@/lib/utils";

export const Route = createFileRoute("/observability")({ component: ObservabilityPage });

function ObservabilityPage() {
  const otel = useQuery({
    queryKey: ["otel"],
    queryFn: () => getOtel(),
    refetchInterval: 4_000,
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const traces = otel.data?.traces ?? [];
  const selected = traces.find((t) => t.traceId === openId) ?? traces[0] ?? null;

  return (
    <AppShell>
      <PageCanvas>
        <PageHeader
          kicker="OpenTelemetry"
          title="Observability"
          description="W3C traces and metrics from the desk. Spans stay in-process and export over OTLP when an endpoint is configured. Query text is not stored on the span."
        />

        {otel.isLoading ? (
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : otel.isError ? (
          <Tile className="mt-8 p-6">
            <p className="text-sm text-danger">Could not load telemetry.</p>
            <Button className="mt-3" variant="secondary" onClick={() => otel.refetch()}>
              Retry
            </Button>
          </Tile>
        ) : (
          <>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile>
                <p className="font-mono text-2xs uppercase tracking-kicker text-dim">Service</p>
                <TileTitle className="mt-2">{otel.data?.service.name}</TileTitle>
                <TileHint>v{otel.data?.service.version} · knowledge-desk</TileHint>
              </Tile>
              <Tile>
                <p className="font-mono text-2xs uppercase tracking-kicker text-dim">Traces</p>
                <TileTitle className="mt-2">{otel.data?.exporter.traces}</TileTitle>
                <TileHint>
                  {otel.data?.exporter.endpoint
                    ? otel.data.exporter.endpoint.replace(/^https?:\/\//, "")
                    : "No OTLP endpoint — in-process ring"}
                </TileHint>
              </Tile>
              <Tile>
                <p className="font-mono text-2xs uppercase tracking-kicker text-dim">Metrics</p>
                <TileTitle className="mt-2">{otel.data?.exporter.metrics}</TileTitle>
                <TileHint>ask · ingest · tokens · errors</TileHint>
              </Tile>
              <Tile>
                <p className="font-mono text-2xs uppercase tracking-kicker text-dim">Protocol</p>
                <TileTitle className="mt-2">OTLP/HTTP</TileTitle>
                <TileHint>traceparent · span events</TileHint>
              </Tile>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard label="Asks" numeric={otel.data?.metrics.asks ?? 0} />
              <KpiCard label="Ingests" numeric={otel.data?.metrics.ingests ?? 0} />
              <KpiCard label="p50" value={formatMs(otel.data?.metrics.p50Ms ?? 0)} />
              <KpiCard label="p95" value={formatMs(otel.data?.metrics.p95Ms ?? 0)} />
              <KpiCard label="Tokens" numeric={otel.data?.metrics.tokens ?? 0} />
              <KpiCard label="LLM asks" numeric={otel.data?.metrics.llmAsks ?? 0} />
              <KpiCard label="Errors" numeric={otel.data?.metrics.errors ?? 0} />
              <KpiCard label="Traces" numeric={traces.length} />
            </div>

            {traces.length === 0 ? (
              <Tile className="mt-8 items-center px-5 py-10 text-center">
                <p className="text-sm text-muted">
                  No spans yet. Ask a question or upload a document — traces appear here as they
                  finish.
                </p>
                <Button asChild variant="secondary" className="mt-4">
                  <Link to="/">Open Ask</Link>
                </Button>
              </Tile>
            ) : (
              <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]">
                <div className="space-y-2">
                  <h2 className="text-sm font-medium">Traces</h2>
                  {traces.map((t, i) => (
                    <BlurFade key={t.traceId} delay={Math.min(i, 8) * 0.03}>
                      <TileButton
                        selected={selected?.traceId === t.traceId}
                        onClick={() => setOpenId(t.traceId)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant={t.status === "ERROR" ? "danger" : "ok"}>{t.status}</Badge>
                          <span className="font-mono text-micro text-dim">{formatMs(t.durationMs)}</span>
                        </div>
                        <TileTitle className="mt-2">{t.name}</TileTitle>
                        <TileMeta>
                          {shortId(t.traceId)}
                          <span aria-hidden> · </span>
                          {t.spanCount} spans
                        </TileMeta>
                      </TileButton>
                    </BlurFade>
                  ))}
                </div>
                {selected ? <TraceDetail trace={selected} /> : null}
              </div>
            )}
          </>
        )}
      </PageCanvas>
    </AppShell>
  );
}

function TraceDetail({ trace }: { trace: OtelTraceView }) {
  const t0 = trace.startMs;
  const window = Math.max(trace.durationMs, 1);
  return (
    <Tile className="min-h-80 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-2xs uppercase tracking-kicker text-dim">Trace</p>
          <h2 className="mt-1 font-display text-2xl italic">{trace.name}</h2>
          <p className="mt-1 font-mono text-micro text-dim">{trace.traceId}</p>
        </div>
        <Badge variant={trace.status === "ERROR" ? "danger" : "ok"}>
          {formatMs(trace.durationMs)}
        </Badge>
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-micro text-muted">
        {Object.entries(trace.attributes)
          .slice(0, 10)
          .map(([k, v]) => (
            <span key={k} className="contents">
              <dt>{k.replace(/^aether\./, "")}</dt>
              <dd className="truncate text-fg">{String(v)}</dd>
            </span>
          ))}
      </dl>
      <div className="mt-6 space-y-2">
        {trace.spans.map((s) => {
          const left = ((s.startMs - t0) / window) * 100;
          const width = Math.max(1.5, (s.durationMs / window) * 100);
          return (
            <div key={s.spanId}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="truncate text-xs text-fg">
                  {s.parentSpanId ? s.name : s.name}
                </span>
                <span className="shrink-0 font-mono text-micro text-dim">{formatMs(s.durationMs)}</span>
              </div>
              <div className="relative h-2 rounded-full bg-elevated">
                <div
                  className={cn(
                    "absolute top-0 h-2 rounded-full",
                    s.status === "ERROR" ? "bg-danger" : "bg-accent",
                  )}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <TileHint className="mt-4">
        traceparent: 00-{trace.traceId}-{trace.spans[0]?.spanId ?? "0".repeat(16)}-01
      </TileHint>
    </Tile>
  );
}
