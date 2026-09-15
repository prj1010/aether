import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { BlurFade } from "@/components/magicui/blur-fade";
import { PageCanvas, PageHeader } from "@/components/page-header";
import { Tile, TileKicker, TileMeta, TileTitle } from "@/components/tile";
import { KpiCard } from "@/components/tremor/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listGolden, listRatings, runEvalSuite, submitRating } from "@/lib/server/aether";
import { useAether } from "@/lib/store";
import { formatMs, formatPct } from "@/lib/utils";

export const Route = createFileRoute("/eval")({ component: EvalPage });

function EvalPage() {
  const golden = useQuery({ queryKey: ["golden"], queryFn: () => listGolden() });
  const ratings = useQuery({ queryKey: ["ratings"], queryFn: () => listRatings() });
  const run = useMutation({ mutationFn: () => runEvalSuite() });
  const last = useAether((s) => s.messages.filter((m) => m.role === "assistant").at(-1));
  const rate = useMutation({
    mutationFn: (rating: "correct" | "partial" | "incorrect") =>
      submitRating({
        data: {
          question: last?.content ? useAether.getState().messages.at(-2)?.content ?? "" : "",
          actualAnswer: last?.content ?? "",
          rating,
        },
      }),
    onSuccess: () => ratings.refetch(),
  });

  const recallHold =
    run.data && run.data.baseline
      ? run.data.recallAt5 + 0.001 >= run.data.baseline.recallAt5
      : null;

  return (
    <AppShell>
      <PageCanvas>
        <PageHeader
          kicker="Quality"
          title="Evaluation"
          description="Retrieval is scored independently of generation. Sharded routing is compared against the unsharded global index so recall is not silently lost."
          actions={
            <Button onClick={() => run.mutate()} disabled={run.isPending}>
              {run.isPending ? "Running suite…" : "Run golden suite"}
            </Button>
          }
        />

        {run.isError ? (
          <Tile className="mt-8 p-5">
            <p className="text-sm text-danger">The suite failed to run. Try again.</p>
          </Tile>
        ) : null}

        {run.data ? (
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard
              label="Sharded recall"
              value={formatPct(run.data.recallAt5)}
              hint={recallHold ? "Holds vs baseline" : "Check against baseline"}
            />
            <KpiCard label="Sharded MRR" value={run.data.mrr.toFixed(2)} />
            <KpiCard
              label="Baseline recall"
              value={formatPct(run.data.baseline.recallAt5)}
            />
            <KpiCard
              label="Baseline MRR"
              value={run.data.baseline.mrr.toFixed(2)}
              hint={`${formatMs(run.data.meanLatency)} sharded · ${formatMs(run.data.baseline.meanLatency)} baseline`}
            />
          </div>
        ) : null}

        {run.data ? (
          <Card className="mt-6 overflow-hidden">
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="font-mono text-2xs uppercase tracking-wider text-dim">
                  <tr>
                    <th className="px-5 py-3 font-medium">Question</th>
                    <th className="py-3 font-medium">Hit</th>
                    <th className="py-3 font-medium">Recall</th>
                    <th className="py-3 font-medium">RR</th>
                    <th className="py-3 font-medium">Path</th>
                    <th className="px-5 py-3 font-medium">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {run.data.results.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="max-w-sm px-5 py-2.5 pr-3">{r.question}</td>
                      <td>
                        <Badge variant={r.hit ? "ok" : "danger"}>{r.hit ? "yes" : "no"}</Badge>
                      </td>
                      <td className="tabular-nums text-muted">{formatPct(r.recallAt5)}</td>
                      <td className="tabular-nums text-muted">{r.reciprocalRank.toFixed(2)}</td>
                      <td className="text-muted">{r.path}</td>
                      <td className="px-5 tabular-nums text-dim">{formatMs(r.latencyMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : golden.isLoading ? (
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : golden.isError ? (
          <Tile className="mt-8 p-5">
            <p className="text-sm text-danger">Could not load the golden set.</p>
            <Button className="mt-3" variant="secondary" onClick={() => golden.refetch()}>
              Retry
            </Button>
          </Tile>
        ) : (
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {(golden.data ?? []).map((g, i) => (
              <BlurFade key={g.id} delay={Math.min(i, 8) * 0.04}>
                <Tile className="min-h-28">
                  <TileKicker>{g.kind.replace("_", " ")}</TileKicker>
                  <TileTitle className="mt-2">{g.question}</TileTitle>
                  <TileMeta>{g.expectedSources.join(" · ")}</TileMeta>
                </Tile>
              </BlurFade>
            ))}
          </div>
        )}

        {last ? (
          <section className="mt-12">
            <h2 className="text-sm font-medium">Rate last answer</h2>
            <p className="mt-2 line-clamp-3 text-sm text-muted">{last.content}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => rate.mutate("correct")}>
                Correct
              </Button>
              <Button size="sm" variant="secondary" onClick={() => rate.mutate("partial")}>
                Partial
              </Button>
              <Button size="sm" variant="secondary" onClick={() => rate.mutate("incorrect")}>
                Incorrect
              </Button>
            </div>
          </section>
        ) : null}

        {(ratings.data ?? []).length > 0 ? (
          <section className="mt-10">
            <h2 className="text-sm font-medium">Office ratings</h2>
            <ul className="mt-3 space-y-2">
              {ratings.data!.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-muted">{r.question}</span>
                  <Badge
                    variant={
                      r.rating === "correct" ? "ok" : r.rating === "partial" ? "warn" : "danger"
                    }
                  >
                    {r.rating}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </PageCanvas>
    </AppShell>
  );
}
