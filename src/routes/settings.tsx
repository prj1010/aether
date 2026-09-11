import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
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

function SettingsPage() {
  const forcePath = useAether((s) => s.forcePath);
  const setForcePath = useAether((s) => s.setForcePath);
  const clearChat = useAether((s) => s.clearChat);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-dim">Control</p>
        <h1 className="mt-2 font-display text-3xl italic">Settings</h1>

        <section className="mt-10">
          <h2 className="text-sm font-medium">Retrieval policy</h2>
          <div className="mt-4 grid gap-3">
            {PATHS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setForcePath(p.id)}
                className={cn(
                  "rounded-xl p-4 text-left shadow-[var(--shadow-border)] transition-colors",
                  forcePath === p.id ? "bg-elevated" : "bg-surface hover:bg-elevated/50",
                )}
              >
                <div className="text-sm font-medium">{p.title}</div>
                <p className="mt-1 text-sm text-muted">{p.body}</p>
              </button>
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
            LinearRAG (ICLR’26) inspired entity–sentence linking without LLM graph construction.
            LogicRAG (AAAI’26) inspired query-time dependency planning. MemPalace inspired L0–L3
            hierarchical memory. This engine is an original implementation of those ideas; research
            code was not copied (GPL-3).
          </p>
          <p>
            Retrieved text is untrusted data. Prompt-injection in a vendor FAQ cannot override
            reimbursement or vacation policy.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
