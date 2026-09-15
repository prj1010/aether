import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  const shardedOk = run.data ? run.data.recallAt5 >= (run.data.baseline?.recallAt5 ?? 0) - 0.001 : false;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-dim">Quality</p>
        <h1 className="mt-2 font-display text-3xl italic">Evaluation</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Retrieval is scored independently of generation. Sharded routing is compared against the
          unsharded global index so recall is not silently lost.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? "Running suite…" : "Run golden suite"}
          </Button>
        </div>

        {run.data ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-surface px-4 py-4 shadow-[var(--shadow-border)]">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-dim">Sharded</span>
                <Badge variant={shardedOk ? "ok" : "danger"}>{shardedOk ? "holds recall" : "below baseline"}</Badge>
              </div>
              <p className="mt-2 font-mono text-sm text-fg">
                Recall@k {formatPct(run.data.recallAt5)} · MRR {run.data.mrr.toFixed(2)} ·{" "}
                {formatMs(run.data.meanLatency)}
              </p>
            </div>
            <div className="rounded-xl bg-surface px-4 py-4 shadow-[var(--shadow-border)]">
              <div className="font-mono text-[10px] uppercase tracking-wider text-dim">Unsharded baseline</div>
              <p className="mt-2 font-mono text-sm text-muted">
                Recall@k {formatPct(run.data.baseline.recallAt5)} · MRR {run.data.baseline.mrr.toFixed(2)} ·{" "}
                {formatMs(run.data.baseline.meanLatency)}
              </p>
            </div>
          </div>
        ) : null}

        {run.data ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="font-mono text-[10px] uppercase tracking-wider text-dim">
                <tr>
                  <th className="py-2 font-medium">Question</th>
                  <th className="py-2 font-medium">Hit</th>
                  <th className="py-2 font-medium">Recall</th>
                  <th className="py-2 font-medium">RR</th>
                  <th className="py-2 font-medium">Path</th>
                  <th className="py-2 font-medium">Latency</th>
                </tr>
              </thead>
              <tbody>
                {run.data.results.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="max-w-sm py-2.5 pr-3">{r.question}</td>
                    <td>
                      <Badge variant={r.hit ? "ok" : "danger"}>{r.hit ? "yes" : "no"}</Badge>
                    </td>
                    <td className="tabular-nums text-muted">{formatPct(r.recallAt5)}</td>
                    <td className="tabular-nums text-muted">{r.reciprocalRank.toFixed(2)}</td>
                    <td className="text-muted">{r.path}</td>
                    <td className="tabular-nums text-dim">{formatMs(r.latencyMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="mt-8 divide-y divide-border border-y border-border">
            {(golden.data ?? []).map((g) => (
              <li key={g.id} className="py-3">
                <div className="text-sm">{g.question}</div>
                <div className="mt-1 font-mono text-[11px] text-dim">
                  {g.kind} · {g.expectedSources.join(", ")}
                </div>
              </li>
            ))}
          </ul>
        )}

        {last ? (
          <section className="mt-12">
            <h2 className="text-sm font-medium">Rate last answer</h2>
            <p className="mt-2 line-clamp-3 text-sm text-muted">{last.content}</p>
            <div className="mt-3 flex gap-2">
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
      </div>
    </AppShell>
  );
}
