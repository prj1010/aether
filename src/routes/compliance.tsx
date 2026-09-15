import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { BrandMark } from "@/components/brand-mark";
import { FrameworkMark } from "@/components/compliance-mark";
import { BlurFade } from "@/components/magicui/blur-fade";
import { PageCanvas, PageHeader } from "@/components/page-header";
import { Tile, TileButton, TileHint, TileKicker, TileMeta, TileTitle } from "@/components/tile";
import { KpiCard } from "@/components/tremor/kpi-card";
import { Tracker } from "@/components/tremor/tracker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  COMPLIANCE_STEPS,
  FRAMEWORKS,
  type FrameworkId,
  type PolicyResult,
  type Verdict,
} from "@/lib/rag/compliance/types";
import { listComplianceCatalog, runComplianceSuite } from "@/lib/server/aether";
import { formatPct } from "@/lib/utils";

export const Route = createFileRoute("/compliance")({ component: CompliancePage });

const PHASES = [
  "Creating regulations set",
  "Adding selected frameworks",
  "Creating Aether application",
  "Capturing live interactions",
  "Running content-safety evaluator",
  "Running retrieval-quality evaluator",
  "Evaluating policies",
  "Generating HTML report",
];

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function CompliancePage() {
  const [selected, setSelected] = useState<FrameworkId[]>([
    "eu_ai_act",
    "nist_ai_rmf",
    "operational",
  ]);
  const [phase, setPhase] = useState(0);
  const catalog = useQuery({ queryKey: ["compliance-catalog"], queryFn: () => listComplianceCatalog() });
  const run = useMutation({
    mutationFn: () => runComplianceSuite({ data: { frameworks: selected } }),
  });
  const report = run.data ?? catalog.data?.last ?? null;
  const app = catalog.data?.application;

  useEffect(() => {
    if (!run.isPending) {
      setPhase(0);
      return;
    }
    setPhase(0);
    const id = window.setInterval(() => {
      setPhase((p) => (p + 1) % PHASES.length);
    }, 700);
    return () => window.clearInterval(id);
  }, [run.isPending]);

  const byFramework = useMemo(() => {
    const map = new Map<FrameworkId, PolicyResult[]>();
    for (const r of report?.results ?? []) {
      const list = map.get(r.framework) ?? [];
      list.push(r);
      map.set(r.framework, list);
    }
    return map;
  }, [report]);

  function toggle(id: FrameworkId) {
    setSelected((cur) => {
      if (cur.includes(id) && cur.length === 1) return cur;
      return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    });
  }

  return (
    <AppShell>
      <PageCanvas>
        <PageHeader
          kicker="Governance"
          title="Compliance"
          description="Compliance-as-code for this knowledge desk. Create a regulations set, wrap Aether as the application, evaluate live interactions, get the report. Inspired by AICertify — original Aether rules, not a legal certification."
          actions={
            <div className="flex flex-wrap gap-2">
              {report?.markdown ? (
                <Button
                  variant="secondary"
                  onClick={() => download(`aether-compliance-${report.id}.md`, report.markdown, "text/markdown;charset=utf-8")}
                >
                  Markdown
                </Button>
              ) : null}
              {report?.html ? (
                <Button
                  variant="secondary"
                  onClick={() => download(`aether-compliance-${report.id}.html`, report.html, "text/html;charset=utf-8")}
                >
                  HTML report
                </Button>
              ) : null}
              <Button onClick={() => run.mutate()} disabled={run.isPending || selected.length === 0}>
                {run.isPending ? "Evaluating…" : "Run evaluation"}
              </Button>
            </div>
          }
        />

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {FRAMEWORKS.map((fw, i) => (
            <BlurFade key={fw.id} delay={i * 0.04}>
              <TileButton
                selected={selected.includes(fw.id)}
                onClick={() => toggle(fw.id)}
                className="min-h-32"
              >
                <div className="flex items-center justify-between gap-3">
                  <FrameworkMark id={fw.id} />
                  <Badge>{fw.kicker}</Badge>
                </div>
                <TileTitle className="mt-4 font-display text-xl italic font-normal">{fw.title}</TileTitle>
                <TileHint>{fw.blurb}</TileHint>
              </TileButton>
            </BlurFade>
          ))}
        </div>

        <section className="mt-8">
          <h2 className="text-sm font-medium">Application</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Step 3 of the loop. The desk is wrapped as an application — name, generator, version — then live interactions are captured from the Northstar index.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Tile beam className="min-h-32">
              <div className="flex items-start justify-between gap-3">
                <BrandMark size={28} />
                <Badge>live</Badge>
              </div>
              <TileTitle className="mt-4 font-display text-xl italic font-normal">
                {app?.name ?? "Aether"}
              </TileTitle>
              <TileHint>
                {app?.purpose ??
                  "Advisory enterprise knowledge retrieval. Answers are cited; a person decides."}
              </TileHint>
              <TileMeta>
                {app?.modelName ?? "extractive"} · v{app?.modelVersion ?? "1.0"} · {app?.operator ?? "Northstar knowledge desk"}
              </TileMeta>
            </Tile>
            <Tile className="min-h-32">
              <TileKicker>Interactions</TileKicker>
              <TileTitle className="mt-3 font-display text-xl italic font-normal">
                {report?.interactions?.length ?? 0} captured
              </TileTitle>
              <TileHint>
                Policy lookup, injection attempt, out-of-corpus refuse, vacation lookup, and a social-comparison probe. Extractive, so the verdict does not depend on a generator.
              </TileHint>
            </Tile>
          </div>
        </section>

        {!report && !run.isPending ? (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {COMPLIANCE_STEPS.map((s) => (
              <Tile key={s.kicker} className="min-h-28">
                <TileKicker>{s.kicker}</TileKicker>
                <TileTitle className="mt-3">{s.title}</TileTitle>
                <TileHint>{s.hint}</TileHint>
              </Tile>
            ))}
          </div>
        ) : null}

        {run.isPending ? (
          <div className="mt-8">
            <Card className="p-5">
              <p className="font-mono text-2xs uppercase tracking-kicker text-dim">Evaluation progress</p>
              <p className="mt-2 text-sm">{PHASES[phase]}</p>
              <ol className="mt-4 grid gap-1 text-xs text-muted sm:grid-cols-2">
                {PHASES.map((p, i) => (
                  <li key={p} className={i === phase ? "text-fg" : ""}>
                    {String(i + 1).padStart(2, "0")} · {p}
                  </li>
                ))}
              </ol>
            </Card>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          </div>
        ) : null}

        {run.isError ? (
          <Card className="mt-8 p-5">
            <p className="text-sm text-danger">Evaluation failed. Try again.</p>
          </Card>
        ) : null}

        {report ? (
          <>
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard label="Allow" numeric={report.summary.allow} />
              <KpiCard label="Deny" numeric={report.summary.deny} />
              <KpiCard label="Not applicable" numeric={report.summary.notApplicable} />
              <KpiCard label="Pass rate" value={formatPct(report.summary.passRate)} />
            </div>

            <BlurFade className="mt-6">
              <Card className="p-4">
                <p className="mb-3 font-mono text-2xs uppercase tracking-kicker text-dim">Policy tracker</p>
                <Tracker
                  data={report.results.map((r) => ({
                    key: r.id,
                    color: verdictColor(r.verdict),
                    tooltip: `${r.article} · ${r.title} · ${r.verdict}`,
                  }))}
                />
              </Card>
            </BlurFade>

            {report.interactions?.length ? (
              <section className="mt-10">
                <h2 className="text-sm font-medium">Interactions</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted">
                  Live asks against the Northstar index. Input and output are the contract AICertify would call interactions.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {report.interactions.map((p) => (
                    <Tile key={p.metadata.id} className="min-h-36">
                      <TileKicker>{p.kind}</TileKicker>
                      <TileTitle className="mt-2">{p.inputText}</TileTitle>
                      <TileHint className="mt-2 line-clamp-4">{p.outputText}</TileHint>
                      <TileMeta>
                        {p.metadata.confidenceBand} · {p.metadata.citationCount} citations ·{" "}
                        {p.metadata.grounded ? "grounded" : "ungrounded"}
                        {p.metadata.injectionFlags.length ? ` · ${p.metadata.injectionFlags.join(", ")}` : ""}
                        {p.metadata.refused ? " · refused" : ""}
                      </TileMeta>
                    </Tile>
                  ))}
                </div>
              </section>
            ) : null}

            {FRAMEWORKS.filter((f) => byFramework.has(f.id)).map((fw) => (
              <section key={fw.id} className="mt-10">
                <div className="mb-4 flex items-center gap-3">
                  <FrameworkMark id={fw.id} />
                  <h2 className="text-sm font-medium">{fw.title}</h2>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {(byFramework.get(fw.id) ?? []).map((r) => (
                    <Tile key={r.id} className="min-h-36">
                      <div className="flex items-center justify-between gap-3">
                        <TileKicker>{r.article}</TileKicker>
                        <Badge
                          variant={
                            r.verdict === "allow" ? "ok" : r.verdict === "deny" ? "danger" : "default"
                          }
                        >
                          {r.verdict.replace("_", " ")}
                        </Badge>
                      </div>
                      <TileTitle className="mt-3">{r.title}</TileTitle>
                      <TileHint>{r.obligation}</TileHint>
                      <ul className="mt-3 space-y-1 text-xs text-muted">
                        {r.evidence.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                        {r.missing.map((e) => (
                          <li key={e} className="text-danger">
                            {e}
                          </li>
                        ))}
                      </ul>
                    </Tile>
                  ))}
                </div>
              </section>
            ))}

            <section className="mt-10 max-w-2xl space-y-3 text-sm leading-relaxed text-muted">
              <h2 className="text-sm font-medium text-fg">Contract</h2>
              <p>{report.contract.declared.purpose}</p>
              <p>
                Declared: {report.contract.declared.riskClass} risk · oversight{" "}
                {report.contract.declared.humanOversight ? "yes" : "no"} · autonomous action{" "}
                {report.contract.declared.autonomousAction ? "yes" : "no"}.
              </p>
              <p>
                Measured: {report.contract.measured.documents} documents ·{" "}
                {report.contract.measured.chunks} chunks · {report.contract.measured.shards} shards ·
                recall {formatPct(report.contract.measured.recallAt5)} vs baseline{" "}
                {formatPct(report.contract.measured.baselineRecallAt5)} ·{" "}
                {report.contract.measured.generatorLabel}.
              </p>
              <p>
                This is Aether’s own evidence file. It is not CE marking, not a notified-body assessment,
                and not legal advice. GOPAL Rego is not shipped; the allow/deny loop is original.
              </p>
            </section>
          </>
        ) : catalog.data?.policies ? (
          <section className="mt-10">
            <h2 className="text-sm font-medium">Policy catalog</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              {catalog.data.policies.length} executable rules. Run evaluation to attach live evidence.
            </p>
            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
              {catalog.data.policies.map((p) => (
                <li key={p.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm">{p.title}</span>
                    <span className="font-mono text-2xs text-dim">
                      {p.framework.replaceAll("_", " ")} · {p.article}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{p.obligation}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </PageCanvas>
    </AppShell>
  );
}

function verdictColor(v: Verdict): string {
  if (v === "allow") return "bg-ok";
  if (v === "deny") return "bg-danger";
  return "bg-subtle";
}
