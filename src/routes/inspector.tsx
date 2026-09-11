import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAether } from "@/lib/store";
import { formatMs, formatPct } from "@/lib/utils";

export const Route = createFileRoute("/inspector")({ component: InspectorPage });

function InspectorPage() {
  const last = useAether((s) => s.lastTrace);
  const traces = useAether((s) => s.traces);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-dim">Retrieval</p>
        <h1 className="mt-2 font-display text-3xl italic">Inspector</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Every ask records classification, strategy, candidate scores, graph hops, and generation
          cost. Nothing in this view is guessed.
        </p>

        {!last ? (
          <p className="mt-12 text-sm text-muted">Ask a question to populate a live trace.</p>
        ) : (
          <div className="mt-8 space-y-10">
            <section>
              <h2 className="text-sm font-medium">Plan</h2>
              <p className="mt-2 text-lg text-fg">{last.query}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant={last.plan.path === "deep" ? "deep" : "fast"}>{last.plan.path}</Badge>
                <Badge>{last.plan.kind}</Badge>
                {last.plan.strategies.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{last.plan.reason}</p>
              {last.plan.subquestions.length > 0 ? (
                <ol className="mt-4 space-y-2">
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
              ) : null}
            </section>

            <section>
              <h2 className="text-sm font-medium">Timing</h2>
              <ul className="mt-3 space-y-2">
                {last.timings.map((s) => (
                  <li key={s.name} className="grid grid-cols-[10rem_1fr_4rem] items-center gap-3">
                    <span className="font-mono text-[11px] text-muted">{s.name}</span>
                    <Progress value={Math.min(100, (s.ms / Math.max(last.timings[last.timings.length - 1]?.ms || 1, 1)) * 12)} />
                    <span className="text-right font-mono text-[11px] tabular-nums text-dim">
                      {formatMs(s.ms)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {last.graph.seeds.length > 0 ? (
              <section>
                <h2 className="text-sm font-medium">Graph</h2>
                <p className="mt-2 text-sm text-muted">
                  {last.graph.hops} hop{last.graph.hops === 1 ? "" : "s"} from{" "}
                  {last.graph.seeds.join(", ") || "no seeds"} · {last.graph.expandedChunks} chunks ·{" "}
                  {last.graph.expandedEntities.length} entities
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {last.graph.expandedEntities.slice(0, 18).map((e) => (
                    <Badge key={e}>{e}</Badge>
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <h2 className="text-sm font-medium">Candidates</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="font-mono text-[10px] uppercase tracking-wider text-dim">
                    <tr>
                      <th className="py-2 font-medium">Source</th>
                      <th className="py-2 font-medium">Sparse</th>
                      <th className="py-2 font-medium">Dense</th>
                      <th className="py-2 font-medium">Hybrid</th>
                      <th className="py-2 font-medium">Graph</th>
                      <th className="py-2 font-medium">Rerank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {last.candidates.map((c) => (
                      <tr key={c.chunkId} className="border-t border-border">
                        <td className="py-2.5 pr-3">
                          <div className="text-fg">{c.title}</div>
                          <div className="font-mono text-[11px] text-dim">
                            {c.section} · p.{c.page}
                          </div>
                        </td>
                        <td className="tabular-nums text-muted">{c.sparse.toFixed(2)}</td>
                        <td className="tabular-nums text-muted">{c.dense.toFixed(2)}</td>
                        <td className="tabular-nums text-muted">{c.hybrid.toFixed(2)}</td>
                        <td className="tabular-nums text-muted">{c.graph.toFixed(2)}</td>
                        <td className="tabular-nums text-accent">{c.rerank.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-medium">Confidence</h2>
              <p className="mt-2 text-2xl tabular-nums">
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
            </section>

            {last.injectionFlags.length > 0 ? (
              <section>
                <h2 className="text-sm font-medium text-danger">Injection flags</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {last.injectionFlags.map((f) => (
                    <Badge key={f} variant="danger">
                      {f}
                    </Badge>
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <h2 className="text-sm font-medium">Generation</h2>
              <p className="mt-2 font-mono text-sm text-muted">
                {last.generation.model} · in {last.generation.inputTokens} · out{" "}
                {last.generation.outputTokens} · {formatMs(last.generation.latencyMs)}
              </p>
            </section>
          </div>
        )}

        {traces.length > 1 ? (
          <section className="mt-12">
            <h2 className="text-sm font-medium">Recent</h2>
            <ul className="mt-3 divide-y divide-border">
              {traces.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-muted">{t.query}</span>
                  <span className="shrink-0 font-mono text-[11px] text-dim">
                    {t.plan.path} · {formatPct(t.confidence.score)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
