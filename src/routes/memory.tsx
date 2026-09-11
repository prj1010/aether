import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { useAether } from "@/lib/store";
import type { MemoryItem } from "@/lib/rag/types";

export const Route = createFileRoute("/memory")({ component: MemoryPage });

const LAYERS: { id: MemoryItem["layer"]; title: string; blurb: string }[] = [
  { id: "L0", title: "Identity", blurb: "Who is asking. Stable, small, never mixed with another person." },
  { id: "L1", title: "Essential story", blurb: "The few facts that should survive a session reset." },
  { id: "L2", title: "Rooms", blurb: "Topic recall — certification, architecture, leave." },
  { id: "L3", title: "Drawers", blurb: "Verbatim slices of prior turns. Indexed, not rewritten." },
];

function MemoryPage() {
  const memory = useAether((s) => s.memory);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-dim">Palace</p>
        <h1 className="mt-2 font-display text-3xl italic">Memory</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Hierarchical memory is not the knowledge base. Documents are organizational facts. This
          palace holds episodic context for the current desk — isolated from other employees by
          construction.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {LAYERS.map((layer) => {
            const items = memory.filter((m) => m.layer === layer.id);
            return (
              <section key={layer.id} className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-2xl italic">
                    {layer.id}
                    <span className="ml-2 not-italic font-sans text-sm text-muted">{layer.title}</span>
                  </h2>
                  <Badge>{items.length}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted">{layer.blurb}</p>
                <ul className="mt-4 space-y-3">
                  {items.length === 0 ? (
                    <li className="text-sm text-dim">Empty</li>
                  ) : (
                    items.map((m) => (
                      <li key={m.id} className="rounded-md bg-elevated p-3">
                        <div className="font-mono text-[10px] uppercase tracking-wider text-dim">
                          {m.wing} / {m.room} / {m.closet}
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-fg/90">{m.content}</p>
                      </li>
                    ))
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
