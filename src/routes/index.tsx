import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowUp,
  FileWarning,
  Loader2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnswerBody } from "@/components/answer-body";
import { AppShell } from "@/components/app-shell";
import { BrandMark, Constellation } from "@/components/brand-mark";
import { CitationSheet } from "@/components/citation-sheet";
import { CollectionGlyph } from "@/components/collection-mark";
import { BentoGrid } from "@/components/magicui/bento-grid";
import { BlurFade } from "@/components/magicui/blur-fade";
import { BorderBeam } from "@/components/magicui/border-beam";
import { TileButton, TileHint, TileTitle } from "@/components/tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CollectionId } from "@/lib/rag/types";
import { askKnowledge } from "@/lib/server/aether";
import { useAether } from "@/lib/store";
import { cn, formatMs, formatPct } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: AskPage });

const SUGGESTIONS: {
  q: string;
  label: string;
  hint: string;
  collection: CollectionId;
  wide?: boolean;
}[] = [
  {
    q: "What is our certification reimbursement policy?",
    label: "Certification reimbursement",
    hint: "Exam fees, caps, L&D overlap",
    collection: "policy",
    wide: true,
  },
  {
    q: "What is the vacation policy?",
    label: "Leave policy",
    hint: "PTO, parental, carryover",
    collection: "people",
  },
  {
    q: "Which architecture was adopted after the team moved from Helios to Nimbus, and what were the reasons?",
    label: "Current architecture",
    hint: "Helios → Nimbus → Forge",
    collection: "architecture",
  },
  {
    q: "What is the current production architecture?",
    label: "Production stack",
    hint: "System of record",
    collection: "architecture",
  },
  {
    q: "What is our monthly remote work stipend?",
    label: "Remote work",
    hint: "Stipend and kit",
    collection: "policy",
  },
  {
    q: "What is the data classification policy?",
    label: "Data classification",
    hint: "Public through Restricted",
    collection: "security",
  },
];

function AskPage() {
  const messages = useAether((s) => s.messages);
  const asking = useAether((s) => s.asking);
  const forcePath = useAether((s) => s.forcePath);
  const shardMode = useAether((s) => s.shardMode);
  const memory = useAether((s) => s.memory);
  const pushUser = useAether((s) => s.pushUser);
  const pushAssistant = useAether((s) => s.pushAssistant);
  const setAsking = useAether((s) => s.setAsking);
  const setActive = useAether((s) => s.setActiveCitation);
  const [value, setValue] = useState("");
  const [composerFocus, setComposerFocus] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, asking]);

  async function submit(q: string) {
    const query = q.trim();
    if (!query || asking) return;
    setValue("");
    pushUser(query);
    setAsking(true);
    try {
      const result = await askKnowledge({
        data: { query, memory, forcePath, shardMode },
      });
      pushAssistant(result);
    } catch (err) {
      pushAssistant({
        answer:
          err instanceof Error
            ? `The engine could not complete this question. ${err.message}`
            : "The engine could not complete this question.",
        citations: [],
        confidence: { score: 0, band: "insufficient", factors: [] },
        path: "fast",
        kind: "factual",
        latencyMs: 0,
        contradictions: [],
        followups: [],
        refused: true,
        trace: {
          id: `err_${Date.now()}`,
          query,
          plan: {
            kind: "factual",
            path: "fast",
            strategies: ["hybrid"],
            reason: "error",
            subquestions: [],
            useMemory: false,
            useGraph: false,
          },
          candidates: [],
          graph: { seeds: [], hops: 0, expandedEntities: [], expandedChunks: 0 },
          contextChunkIds: [],
          contradictions: [],
          confidence: { score: 0, band: "insufficient", factors: [] },
          timings: [],
          generation: {
            model: "none",
            usedLlm: false,
            inputTokens: 0,
            outputTokens: 0,
            latencyMs: 0,
          },
          injectionFlags: [],
          createdAt: new Date().toISOString(),
        },
      });
    } finally {
      setAsking(false);
    }
  }

  return (
    <AppShell>
      <div className="flex h-[calc(100dvh-56px)] flex-col md:h-dvh">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 && !asking ? (
            <Empty onPick={submit} />
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 md:px-8">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[min(100%,36rem)] rounded-xl rounded-br-sm bg-elevated px-4 py-3 text-prose leading-relaxed">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <article key={m.id} className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={m.path === "deep" ? "deep" : "fast"}>
                        {m.path === "deep" ? "Deep path" : "Fast path"}
                      </Badge>
                      {m.confidence ? (
                        <Badge
                          variant={
                            m.confidence.band === "high"
                              ? "ok"
                              : m.confidence.band === "insufficient"
                                ? "danger"
                                : m.confidence.band === "low"
                                  ? "warn"
                                  : "default"
                          }
                        >
                          {m.confidence.band} · {formatPct(m.confidence.score)}
                        </Badge>
                      ) : null}
                      {m.shardCount ? <Badge>{m.shardCount} shards</Badge> : null}
                      {m.latencyMs ? (
                        <span className="font-mono text-micro text-dim">{formatMs(m.latencyMs)}</span>
                      ) : null}
                    </div>
                    <AnswerBody text={m.content} citations={m.citations} />
                    {m.contradictions && m.contradictions.length > 0 ? (
                      <div className="rounded-lg border border-warn/30 bg-warn/8 px-4 py-3 text-sm">
                        <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-warn">
                          <FileWarning className="size-3.5" />
                          Conflict
                        </div>
                        {m.contradictions.map((c) => (
                          <p key={c.topic} className="text-fg/90">
                            {c.resolution}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {m.citations && m.citations.length > 0 ? (
                      <ul className="space-y-1.5">
                        {m.citations.map((c) => (
                          <li key={c.chunkId}>
                            <button
                              type="button"
                              onClick={() => setActive(c)}
                              className="flex min-h-11 w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left hover:bg-elevated"
                            >
                              <span className="w-5 font-mono text-micro text-accent">{c.n}</span>
                              <span className="min-w-0 flex-1 truncate text-sm text-muted">
                                {c.title}
                                <span className="text-dim">
                                  {" "}
                                  · p.{c.page} · {c.section}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {m.followups && m.followups.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {m.followups.map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => submit(f)}
                            className="min-h-11 rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:border-border-strong hover:text-fg"
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ),
              )}
              {asking ? <Thinking /> : null}
              <div ref={bottom} />
            </div>
          )}
        </div>

        <form
          className="border-t border-border bg-surface/80 px-3 py-3 backdrop-blur-sm md:px-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(value);
          }}
        >
          <div
            className={cn(
              "relative mx-auto flex max-w-3xl items-end gap-2 rounded-xl bg-elevated p-2 shadow-[var(--shadow-border)]",
              composerFocus && "shadow-[var(--shadow-border-hover)]",
            )}
          >
            {composerFocus ? <BorderBeam size={48} duration={7} /> : null}
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setComposerFocus(true)}
              onBlur={() => setComposerFocus(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit(value);
                }
              }}
              rows={1}
              placeholder="Ask a question…"
              aria-label="Question"
              className="max-h-36 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-prose text-fg placeholder:text-dim focus:outline-none"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!value.trim() || asking}
              aria-label="Send"
            >
              {asking ? <Loader2 className="animate-spin" /> : <ArrowUp />}
            </Button>
          </div>
          <p className="mx-auto mt-2 max-w-3xl px-2 font-mono text-2xs uppercase tracking-kicker text-dim">
            {forcePath} path · {shardMode} shards · cited answers
          </p>
        </form>
      </div>
      <CitationSheet />
    </AppShell>
  );
}

function Empty({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-end px-4 pb-6 pt-10 md:justify-center md:px-8 md:pt-8">
      <BlurFade>
        <div className="flex items-center gap-3">
          <BrandMark size={36} />
          <p className="font-mono text-micro uppercase tracking-kicker text-dim">Knowledge desk</p>
        </div>
        <h1 className="mt-4 font-display text-4xl italic leading-[1.1] tracking-tight md:text-5xl">
          Ask the knowledge base.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
          Answers come from indexed documents, with citations. Policy lookups stay on the fast path.
          Multi-hop and temporal questions open the graph.
        </p>
      </BlurFade>
      <BentoGrid className="mt-8 lg:grid-cols-3">
        {SUGGESTIONS.map((s, i) => (
          <BlurFade key={s.q} delay={0.05 * i} className={s.wide ? "sm:col-span-2 lg:col-span-2" : ""}>
            <TileButton
              className={cn("min-h-28 justify-between", s.wide && "min-h-32 sm:min-h-36")}
              onClick={() => onPick(s.q)}
            >
              {s.wide ? (
                <Constellation className="pointer-events-none absolute -right-6 top-2 h-24 w-56 opacity-40" />
              ) : null}
              <CollectionGlyph id={s.collection} />
              <div className="relative mt-4">
                <TileTitle>{s.label}</TileTitle>
                <TileHint>{s.hint}</TileHint>
              </div>
            </TileButton>
          </BlurFade>
        ))}
      </BentoGrid>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-3 text-sm text-muted" role="status" aria-live="polite">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-2 animate-ping rounded-full bg-accent/60" />
        <span className="relative inline-flex size-2 rounded-full bg-accent" />
      </span>
      <span className="shimmer-text font-mono text-xs uppercase tracking-kicker">
        Classify · route shards · retrieve · rerank · generate
      </span>
    </div>
  );
}
