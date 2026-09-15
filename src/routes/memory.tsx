import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PalaceDiagram } from "@/components/collection-mark";
import { BlurFade } from "@/components/magicui/blur-fade";
import { PageCanvas, PageHeader } from "@/components/page-header";
import { Tile, TileHint, TileKicker, TileTitle } from "@/components/tile";
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
      <PageCanvas>
        <PageHeader
          kicker="Palace"
          title="Memory"
          description="Hierarchical memory is not the knowledge base. Documents are organizational facts. This palace holds episodic context for the current desk — isolated from other employees by construction."
        />

        <PalaceDiagram className="mt-8 hidden h-24 w-full max-w-lg md:block" />

        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {LAYERS.map((layer, i) => {
            const items = memory.filter((m) => m.layer === layer.id);
            return (
              <BlurFade key={layer.id} delay={i * 0.06}>
                <Tile className="min-h-44">
                  <div className="flex items-baseline justify-between gap-3">
                    <TileKicker>{layer.id}</TileKicker>
                    <Badge>{items.length}</Badge>
                  </div>
                  <TileTitle className="mt-2 font-display text-2xl italic font-normal">
                    {layer.title}
                  </TileTitle>
                  <TileHint className="text-sm text-muted">{layer.blurb}</TileHint>
                  <ul className="mt-4 space-y-3">
                    {items.length === 0 ? (
                      <li className="text-sm text-dim">Empty — this layer fills as you ask.</li>
                    ) : (
                      items.map((m) => (
                        <li key={m.id} className="rounded-md bg-elevated p-3">
                          <div className="font-mono text-2xs uppercase tracking-wider text-dim">
                            {m.wing} / {m.room} / {m.closet}
                          </div>
                          <p className="mt-1.5 text-sm leading-relaxed text-fg/90">{m.content}</p>
                        </li>
                      ))
                    )}
                  </ul>
                </Tile>
              </BlurFade>
            );
          })}
        </div>
      </PageCanvas>
    </AppShell>
  );
}
