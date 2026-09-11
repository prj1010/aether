import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useAether } from "@/lib/store";
import { formatPct } from "@/lib/utils";

export function CitationSheet() {
  const cit = useAether((s) => s.activeCitation);
  const set = useAether((s) => s.setActiveCitation);
  return (
    <Sheet
      open={!!cit}
      onOpenChange={(o) => {
        if (!o) set(null);
      }}
      title={cit?.title ?? "Source"}
      description={cit ? `${cit.filename} · p.${cit.page} · ${cit.section}` : undefined}
    >
      {cit ? (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge>v{cit.version}</Badge>
            <Badge variant="accent">{formatPct(cit.score)} score</Badge>
            <Badge>
              {cit.validFrom}
              {cit.validTo ? ` → ${cit.validTo}` : " → current"}
            </Badge>
          </div>
          <blockquote className="border-l-2 border-accent/40 pl-4 text-sm leading-relaxed text-fg/90">
            {cit.excerpt}
          </blockquote>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 font-mono text-[11px] text-muted">
            <dt>Chunk</dt>
            <dd className="truncate text-fg">{cit.chunkId}</dd>
            <dt>Document</dt>
            <dd className="truncate text-fg">{cit.documentId}</dd>
            <dt>Page</dt>
            <dd className="text-fg">{cit.page}</dd>
            <dt>Section</dt>
            <dd className="text-fg">{cit.section}</dd>
          </dl>
        </div>
      ) : null}
    </Sheet>
  );
}
