import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageCanvas, PageHeader } from "@/components/page-header";
import { Tile, TileButton, TileHint, TileTitle } from "@/components/tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getGeneratorStatus, getOtel, getSystemPrompt, saveSystemPrompt } from "@/lib/server/aether";
import { useAether } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

const PATHS = [
  {
    id: "adaptive" as const,
    title: "Adaptive",
    body: "Cheap retrieval first. Graph and dependency planning only when the question needs them.",
  },
  {
    id: "fast" as const,
    title: "Fast",
    body: "Hybrid retrieve, rerank, answer. Never expand the graph.",
  },
  {
    id: "deep" as const,
    title: "Deep",
    body: "Always plan sub-questions and walk the entity graph.",
  },
];

const SHARDS = [
  {
    id: "adaptive" as const,
    title: "Adaptive shards",
    body: "Route to 1–3 collection shards, then expand if evidence is thin. Worst case: every authorized shard. The default.",
  },
  {
    id: "all" as const,
    title: "All shards",
    body: "Search every authorized shard on every ask. Same recall as the unsharded index, more retrieval work.",
  },
];

function SettingsPage() {
  const qc = useQueryClient();
  const forcePath = useAether((s) => s.forcePath);
  const setForcePath = useAether((s) => s.setForcePath);
  const shardMode = useAether((s) => s.shardMode);
  const setShardMode = useAether((s) => s.setShardMode);
  const clearChat = useAether((s) => s.clearChat);
  const generator = useQuery({ queryKey: ["generator"], queryFn: () => getGeneratorStatus() });
  const otel = useQuery({ queryKey: ["otel"], queryFn: () => getOtel() });
  const promptQ = useQuery({ queryKey: ["system-prompt"], queryFn: () => getSystemPrompt() });
  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (promptQ.data?.prompt && !draft) setDraft(promptQ.data.prompt);
  }, [promptQ.data, draft]);
  const savePrompt = useMutation({
    mutationFn: () => saveSystemPrompt({ data: { prompt: draft } }),
    onSuccess: (res) => {
      setDraft(res.prompt);
      void qc.invalidateQueries({ queryKey: ["system-prompt"] });
    },
  });

  return (
    <AppShell>
      <PageCanvas className="max-w-3xl">
        <PageHeader kicker="Control" title="Settings" />

        <section className="mt-10">
          <h2 className="text-sm font-medium">Generator</h2>
          <p className="mt-2 text-sm text-muted">
            Retrieval is model-agnostic. With no generator key, answers stay extractive from the
            indexed documents.
          </p>
          <Tile className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">
                {generator.data?.label ?? "Checking generator…"}
              </span>
              {generator.data ? (
                <Badge variant={generator.data.configured ? "ok" : "default"}>
                  {generator.data.configured ? "LLM" : "Extractive"}
                </Badge>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-muted">
              {generator.data?.configured
                ? "The active generator is used only after retrieval and rerank."
                : "No generator key is configured. Answers are assembled from retrieved passages."}
            </p>
          </Tile>
          {generator.data?.providers?.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="font-mono text-micro uppercase tracking-kicker text-dim">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Provider</th>
                    <th className="py-2 pr-4 font-medium">Env</th>
                    <th className="py-2 font-medium">Default model</th>
                  </tr>
                </thead>
                <tbody>
                  {generator.data.providers.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="py-2 pr-4">
                        <span className={cn(generator.data?.provider === p.id && "text-fg")}>
                          {p.label}
                        </span>
                      </td>
                      <td className="py-2 pr-4 font-mono text-micro text-muted">
                        {p.needsKey ? p.keyEnvs[0] ?? "LLM_API_KEY" : "none (local)"}
                      </td>
                      <td className="py-2 font-mono text-micro text-muted">{p.defaultModel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-medium">Telemetry</h2>
          <p className="mt-2 text-sm text-muted">
            OpenTelemetry traces and metrics for every ask and ingest. Export over OTLP/HTTP when
            an endpoint is set; otherwise the in-process ring feeds Observability.
          </p>
          <Tile className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{otel.data?.service.name ?? "aether"}</span>
              <Badge variant="ok">{otel.data?.exporter.traces ?? "in-process"}</Badge>
            </div>
            <p className="mt-2 font-mono text-micro text-dim">
              {otel.data?.exporter.endpoint
                ? otel.data.exporter.endpoint
                : "OTEL_EXPORTER_OTLP_ENDPOINT is unset — traces stay in-process"}
            </p>
          </Tile>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-medium">System prompt</h2>
          <p className="mt-2 text-sm text-muted">
            Operator instructions for generation. Retrieval, citations, and untrusted-document
            isolation stay in force regardless of this text.
          </p>
          <Tile className="mt-4 space-y-3">
            {promptQ.isLoading ? (
              <p className="text-sm text-muted">Loading prompt…</p>
            ) : (
              <Textarea
                className="min-h-56 font-mono text-xs leading-relaxed"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="System prompt"
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                disabled={savePrompt.isPending || !draft.trim()}
                onClick={() => savePrompt.mutate()}
              >
                {savePrompt.isPending ? "Saving…" : "Save prompt"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={savePrompt.isPending}
                onClick={() => {
                  if (promptQ.data?.prompt) setDraft(promptQ.data.prompt);
                }}
              >
                Reset
              </Button>
              {promptQ.data?.isDefault ? <Badge>Default</Badge> : <Badge variant="ok">Custom</Badge>}
            </div>
            {savePrompt.isError ? (
              <p className="text-sm text-danger">Could not save the prompt.</p>
            ) : null}
          </Tile>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-medium">Retrieval policy</h2>
          <div className="mt-4 grid gap-3">
            {PATHS.map((p) => (
              <TileButton
                key={p.id}
                selected={forcePath === p.id}
                beam={forcePath === p.id}
                onClick={() => setForcePath(p.id)}
              >
                <TileTitle>{p.title}</TileTitle>
                <TileHint className="text-sm text-muted">{p.body}</TileHint>
              </TileButton>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-medium">Shard routing</h2>
          <p className="mt-2 text-sm text-muted">
            Shards are a routing layer around the existing index — not a replacement for hybrid
            retrieval, the entity graph, or memory.
          </p>
          <div className="mt-4 grid gap-3">
            {SHARDS.map((p) => (
              <TileButton
                key={p.id}
                selected={shardMode === p.id}
                beam={shardMode === p.id}
                onClick={() => setShardMode(p.id)}
              >
                <TileTitle>{p.title}</TileTitle>
                <TileHint className="text-sm text-muted">{p.body}</TileHint>
              </TileButton>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-medium">Session</h2>
          <Button className="mt-4" variant="secondary" onClick={clearChat}>
            Clear conversation
          </Button>
        </section>

        <section className="mt-10 space-y-3 text-sm leading-relaxed text-muted">
          <h2 className="text-sm font-medium text-fg">How it decides</h2>
          <p>
            Simple lookups (vacation, a named policy) use BM25 + hashed dense retrieval, then a
            cheap rerank. Multi-hop and temporal questions — “what was adopted after Helios moved to
            Nimbus” — open a relation-free entity graph and a dependency plan. Memory is a palace,
            not a second index of the documents.
          </p>
          <p>
            The shard router scores collection profiles (ACL, metadata, entities, time, health) and
            retrieves in parallel. Results fuse with reciprocal rank fusion before the existing
            reranker. LinearRAG walks only searched shards, with targeted cross-shard entity hops.
            LogicRAG routes each sub-question independently.
          </p>
          <p>
            LinearRAG (ICLR’26) inspired entity–sentence linking without LLM graph construction.
            LogicRAG (AAAI’26) inspired query-time dependency planning. MemPalace inspired L0–L3
            hierarchical memory. This engine is an original implementation of those ideas; research
            code was not copied (GPL-3).
          </p>
          <p>
            Retrieved text is untrusted data. Prompt-injection in a vendor FAQ cannot override
            reimbursement or vacation policy.
          </p>
          <p>
            Compliance is a wrap around the same engine, following AICertify’s five-step loop:
            create a regulations set, select EU AI Act / NIST AI RMF / operational targets, wrap
            Aether as the application, evaluate live interactions, get an HTML report. Declared
            facts (advisory use, human oversight, no social scoring) plus measured probes
            (citations, injection isolation, recall vs baseline) are the contract. The policies
            are original. A report is evidence, not a legal certification.
          </p>
        </section>
      </PageCanvas>
    </AppShell>
  );
}
