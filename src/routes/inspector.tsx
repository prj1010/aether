import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PIPELINE, PipelineMark } from "@/components/collection-mark";
import { BlurFade } from "@/components/magicui/blur-fade";
import { PageCanvas, PageHeader } from "@/components/page-header";
import { Tile, TileHint, TileKicker, TileTitle } from "@/components/tile";
import { KpiCard } from "@/components/tremor/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAether } from "@/lib/store";
import { formatMs, formatPct } from "@/lib/utils";

export const Route = createFileRoute("/inspector")({ component: InspectorPage });

const STAGE_COPY: Record<(typeof PIPELINE)[number], string> = {
  Classify: "Kind, path, and strategies.",
  Route: "ACL, then collection shards.",
  Retrieve: "Hybrid BM25 + dense per shard.",
  Rerank: "Global rescore, then MMR.",
  Generate: "Cited answer, extractive or LLM.",
};

function InspectorPage() {
  const last = useAether((s) => s.lastTrace);
  const traces = useAether((s) => s.traces);
  const sharding = last?.sharding;

  return (
    <AppShell>
      <PageCanvas>
        <PageHeader
          kicker="Retrieval"
          title="Inspector"
          description="Every ask records classification, shard routing, candidate scores, graph hops, and generation cost. Nothing in this view is guessed."
        />

        {!last ? (
          <div className="mt-10">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {PIPELINE.map((name, i) => (
                <BlurFade key={name} delay={i * 0.05}>
                  <Tile className="min-h-32">
                    <PipelineMark active={i} className="h-4 w-full" />
                    <TileKicker className="mt-4">Stage {i + 1}</TileKicker>
                    <TileTitle className="mt-1">{name}</TileTitle>
                    <TileHint>{STAGE_COPY[name]}</TileHint>
                  </Tile>
                </BlurFade>
              ))}
            </div>
            <p className="mt-8 max-w-lg text-sm text-muted">
              Ask a question. This page fills with the live retrieval trace — plan, shards, scores,
              and generation cost.
            </p>
            <Button asChild variant="secondary" className="mt-4">
              <Link to="/">Open Ask</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            <BlurFade>
              <p className="text-lg text-fg">{last.query}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant={last.plan.path === "deep" ? "deep" : "fast"}>{last.plan.path}</Badge>
                <Badge>{last.plan.kind}</Badge>
                {last.plan.strategies.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{last.plan.reason}</p>
            </BlurFade>

            {last.plan.subquestions.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Sub-questions</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-2">
                    {last.plan.subquestions.map((q) => (
                      <li key={q.id} className="flex gap-3 text-sm">
                        <span className="font-mono text-xs text-accent">{q.id}</span>
                        <span>
                          {q.text}
                          {q.dependsOn.length ? (
                            <span className="text-dim"> ← {q.dependsOn.join(", ")}</span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            ) : null}

            {sharding ? (
              <section>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-medium">Shard routing</h2>
                  <Badge>{sharding.mode}</Badge>
                  <Badge>{sharding.searched.length} searched</Badge>
                  {sharding.expanded ? <Badge variant="warn">expanded</Badge> : null}
                  {sharding.cacheHit ? <Badge variant="ok">cache hit</Badge> : <Badge>cache miss</Badge>}
                  <Badge>
                    RRF {sharding.merge.inputs}→{sharding.merge.unique}
                  </Badge>
                </div>
                <p className="mb-4 max-w-2xl text-sm text-muted">
                  ACL first, then weighted collection profiles. Retrieval starts on 1–3 shards and
                  expands only if evidence is thin. Memory is never mixed into these indexes.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sharding.routed.map((r) => {
                    const searched = sharding.searched.includes(r.shardId);
                    return (
                      <Tile key={r.shardId} selected={searched} beam={searched}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-mono text-micro text-fg">{r.shardId}</span>
                          <Badge variant={searched ? "ok" : "default"}>
                            {searched ? "searched" : "ranked"}
                          </Badge>
                        </div>
                        <Progress className="mt-3" value={Math.min(100, r.score * 100)} />
                        <div className="mt-2 flex items-baseline justify-between text-micro text-dim">
                          <span>{r.reasons.join(" · ") || "profile"}</span>
                          <span className="tabular-nums">{r.score.toFixed(2)}</span>
                        </div>
                      </Tile>
                    );
                  })}
                </div>
                {sharding.skipped.length > 0 ? (
                  <p className="mt-3 font-mono text-2xs text-dim">
                    skipped {sharding.skipped.map((s) => `${s.shardId} (${s.reason})`).join(" · ")}
                  </p>
                ) : null}
                {sharding.crossShardEntities.length > 0 ? (
                  <p className="mt-2 text-sm text-muted">
                    Cross-shard entities: {sharding.crossShardEntities.join(", ")}
                  </p>
                ) : null}
                {sharding.failures.length > 0 ? (
                  <p className="mt-2 text-sm text-danger">Failures: {sharding.failures.join("; ")}</p>
                ) : null}
              </section>
            ) : null}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {last.timings.map((s) => (
                <KpiCard key={s.name} label={s.name} value={formatMs(s.ms)} />
              ))}
            </div>

            {last.graph.seeds.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Graph</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted">
                    {last.graph.hops} hop{last.graph.hops === 1 ? "" : "s"} from{" "}
                    {last.graph.seeds.join(", ") || "no seeds"} · {last.graph.expandedChunks} chunks ·{" "}
                    {last.graph.expandedEntities.length} entities
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {last.graph.expandedEntities.slice(0, 18).map((e) => (
                      <Badge key={e}>{e}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Candidates</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto px-0 pb-0">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="font-mono text-2xs uppercase tracking-wider text-dim">
                    <tr>
                      <th className="px-5 py-2 font-medium">Source</th>
                      <th className="py-2 font-medium">Shard</th>
                      <th className="py-2 font-medium">Sparse</th>
                      <th className="py-2 font-medium">Dense</th>
                      <th className="py-2 font-medium">Hybrid</th>
                      <th className="py-2 font-medium">Graph</th>
                      <th className="px-5 py-2 font-medium">Rerank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {last.candidates.map((c) => (
                      <tr key={c.chunkId} className="border-t border-border">
                        <td className="px-5 py-2.5 pr-3">
                          <div className="text-fg">{c.title}</div>
                          <div className="font-mono text-micro text-dim">
                            {c.section} · p.{c.page}
                          </div>
                        </td>
                        <td className="font-mono text-2xs text-dim">
                          {c.shardId?.replace(/^northstar\./, "") ?? "—"}
                        </td>
                        <td className="tabular-nums text-muted">{c.sparse.toFixed(2)}</td>
                        <td className="tabular-nums text-muted">{c.dense.toFixed(2)}</td>
                        <td className="tabular-nums text-muted">{c.hybrid.toFixed(2)}</td>
                        <td className="tabular-nums text-muted">{c.graph.toFixed(2)}</td>
                        <td className="px-5 tabular-nums text-accent">{c.rerank.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Confidence</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl tabular-nums">
                  {formatPct(last.confidence.score)}{" "}
                  <span className="text-base text-muted">{last.confidence.band}</span>
                </p>
                <ul className="mt-3 space-y-2">
                  {last.confidence.factors.map((f) => (
                    <li key={f.name} className="flex items-baseline justify-between gap-4 text-sm">
                      <span className="text-muted">
                        {f.name}
                        <span className="ml-2 text-dim">{f.note}</span>
                      </span>
                      <span className="tabular-nums">{f.value.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {last.injectionFlags.length > 0 ? (
              <Card className="p-5">
                <h2 className="text-sm font-medium text-danger">Injection flags</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {last.injectionFlags.map((f) => (
                    <Badge key={f} variant="danger">
                      {f}
                    </Badge>
                  ))}
                </div>
              </Card>
            ) : null}

            <p className="font-mono text-sm text-muted">
              {last.generation.model} · in {last.generation.inputTokens} · out {last.generation.outputTokens}{" "}
              · {formatMs(last.generation.latencyMs)}
            </p>
          </div>
        )}

        {traces.length > 1 ? (
          <section className="mt-12">
            <h2 className="text-sm font-medium">Recent</h2>
            <ul className="mt-3 divide-y divide-border">
              {traces.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-muted">{t.query}</span>
                  <span className="shrink-0 font-mono text-micro text-dim">
                    {t.plan.path}
                    {t.sharding ? ` · ${t.sharding.searched.length} shards` : ""} ·{" "}
                    {formatPct(t.confidence.score)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </PageCanvas>
    </AppShell>
  );
}
