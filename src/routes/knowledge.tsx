import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { getDoc, ingestDocument, listDocs } from "@/lib/server/aether";
import { COLLECTION_LABEL, type CollectionId } from "@/lib/rag/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/knowledge")({ component: KnowledgePage });

const COLLECTIONS: CollectionId[] = [
  "policy",
  "architecture",
  "people",
  "security",
  "product",
  "operations",
];

function KnowledgePage() {
  const qc = useQueryClient();
  const docs = useQuery({ queryKey: ["docs"], queryFn: () => listDocs() });
  const [filter, setFilter] = useState<CollectionId | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showIngest, setShowIngest] = useState(false);
  const detail = useQuery({
    queryKey: ["doc", openId],
    queryFn: () => getDoc({ data: { id: openId! } }),
    enabled: !!openId,
  });

  const rows = (docs.data ?? []).filter((d) => filter === "all" || d.collection === filter);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-dim">Corpus</p>
            <h1 className="mt-2 font-display text-3xl italic">Knowledge</h1>
            <p className="mt-2 max-w-lg text-sm text-muted">
              Structured Northstar documents with versions, validity windows, and provenance on every
              chunk.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setShowIngest(true)}>
            Add document
          </Button>
        </header>

        <div className="mt-8 flex gap-2 overflow-x-auto pb-2">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </FilterChip>
          {COLLECTIONS.map((c) => (
            <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)}>
              {COLLECTION_LABEL[c]}
            </FilterChip>
          ))}
        </div>

        <ul className="mt-4 divide-y divide-border border-y border-border">
          {rows.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setOpenId(d.id)}
                className="flex w-full flex-col gap-1 py-4 text-left md:flex-row md:items-baseline md:gap-6"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] text-fg">{d.title}</span>
                  <span className="mt-1 block font-mono text-[11px] text-dim">{d.filename}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge>{COLLECTION_LABEL[d.collection]}</Badge>
                  <Badge variant={d.status === "deprecated" ? "warn" : "ok"}>{d.status}</Badge>
                  <span className="font-mono text-[11px] text-dim">
                    v{d.version} · {d.validFrom}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Sheet
        open={!!openId}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
        title={detail.data?.document.title ?? "Document"}
        description={detail.data?.document.filename}
      >
        {detail.data ? (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Badge>{COLLECTION_LABEL[detail.data.document.collection]}</Badge>
              <Badge variant={detail.data.document.status === "deprecated" ? "warn" : "ok"}>
                {detail.data.document.status}
              </Badge>
              <Badge>v{detail.data.document.version}</Badge>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono text-[11px] text-muted">
              <dt>Valid</dt>
              <dd className="text-fg">
                {detail.data.document.validFrom}
                {detail.data.document.validTo ? ` → ${detail.data.document.validTo}` : " → current"}
              </dd>
              <dt>Author</dt>
              <dd className="text-fg">{detail.data.document.author}</dd>
              <dt>Class</dt>
              <dd className="text-fg">{detail.data.document.classification}</dd>
              <dt>Chunks</dt>
              <dd className="text-fg">{detail.data.chunks.length}</dd>
            </dl>
            {detail.data.chunks.map((c) => (
              <section key={c.id} className="rounded-lg bg-elevated p-4">
                <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-dim">
                  <span>
                    {c.section} · p.{c.page}
                  </span>
                  <span>{c.tokenCount} tok</span>
                </div>
                <p className="text-sm leading-relaxed text-fg/90">{c.content}</p>
                {c.entities.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {c.entities.slice(0, 8).map((e) => (
                      <Badge key={e}>{e}</Badge>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Loading…</p>
        )}
      </Sheet>

      <IngestSheet
        open={showIngest}
        onOpenChange={setShowIngest}
        onDone={() => {
          setShowIngest(false);
          void qc.invalidateQueries({ queryKey: ["docs"] });
        }}
      />
    </AppShell>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 shrink-0 rounded-full px-3 text-xs",
        active ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function IngestSheet({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [collection, setCollection] = useState<CollectionId>("policy");
  const [text, setText] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      ingestDocument({
        data: {
          title,
          filename: `${title.replace(/\s+/g, "-").toLowerCase() || "note"}.txt`,
          collection,
          text,
        },
      }),
    onSuccess: onDone,
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Ingest document" description="Paste text. Structure is preserved as a single section if none is provided.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && text.trim()) mut.mutate();
        }}
      >
        <label className="block text-xs text-muted">
          Title
          <Input className="mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block text-xs text-muted">
          Collection
          <select
            className="mt-1.5 h-10 w-full rounded-md border border-border bg-elevated px-3 text-sm text-fg"
            value={collection}
            onChange={(e) => setCollection(e.target.value as CollectionId)}
          >
            {COLLECTIONS.map((c) => (
              <option key={c} value={c}>
                {COLLECTION_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted">
          Body
          <Textarea className="mt-1.5 min-h-40" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <Button type="submit" disabled={mut.isPending || !title.trim() || !text.trim()}>
          {mut.isPending ? "Indexing…" : "Index"}
        </Button>
      </form>
    </Sheet>
  );
}
