import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { CollectionGlyph } from "@/components/collection-mark";
import { BlurFade } from "@/components/magicui/blur-fade";
import { PageCanvas, PageHeader } from "@/components/page-header";
import { Tile, TileButton, TileHint, TileMeta, TileTitle } from "@/components/tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
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
      <PageCanvas>
        <PageHeader
          kicker="Corpus"
          title="Knowledge"
          description="Structured Northstar documents with versions, validity windows, and provenance on every chunk."
          actions={
            <Button variant="secondary" onClick={() => setShowIngest(true)}>
              <Plus className="size-4" />
              Add document
            </Button>
          }
        />

        <div className="mt-8 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Collections">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </FilterChip>
          {COLLECTIONS.map((c) => (
            <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)}>
              {COLLECTION_LABEL[c]}
            </FilterChip>
          ))}
        </div>

        {docs.isLoading ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        ) : docs.isError ? (
          <Tile className="mt-6 p-6">
            <p className="text-sm text-danger">Could not load documents.</p>
            <Button className="mt-3" variant="secondary" onClick={() => docs.refetch()}>
              Retry
            </Button>
          </Tile>
        ) : rows.length === 0 ? (
          <Tile className="mt-6 items-center px-5 py-10 text-center">
            <FileText className="size-6 text-dim" />
            <p className="mt-3 text-sm text-muted">No documents in this collection.</p>
          </Tile>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((d, i) => (
              <BlurFade key={d.id} delay={Math.min(i, 8) * 0.04}>
                <TileButton className="min-h-36" onClick={() => setOpenId(d.id)}>
                  <div className="flex items-center justify-between gap-3">
                    <CollectionGlyph id={d.collection} />
                    <Badge variant={d.status === "deprecated" ? "warn" : "ok"}>{d.status}</Badge>
                  </div>
                  <TileTitle className="mt-4">{d.title}</TileTitle>
                  <TileHint className="font-mono">{d.filename}</TileHint>
                  <TileMeta>
                    {COLLECTION_LABEL[d.collection]}
                    <span aria-hidden="true"> · </span>
                    v{d.version}
                    <span aria-hidden="true"> · </span>
                    {d.validFrom}
                  </TileMeta>
                </TileButton>
              </BlurFade>
            ))}
          </div>
        )}
      </PageCanvas>

      <Sheet
        open={!!openId}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
        title={detail.data?.document.title ?? "Document"}
        description={detail.data?.document.filename}
      >
        {detail.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : detail.data ? (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Badge>{COLLECTION_LABEL[detail.data.document.collection]}</Badge>
              <Badge variant={detail.data.document.status === "deprecated" ? "warn" : "ok"}>
                {detail.data.document.status}
              </Badge>
              <Badge>v{detail.data.document.version}</Badge>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono text-micro text-muted">
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
                <div className="mb-2 flex items-center justify-between font-mono text-2xs uppercase tracking-wider text-dim">
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
          <p className="text-sm text-muted">Document not found.</p>
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "h-11 shrink-0 rounded-full px-3 text-xs",
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
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Ingest document"
      description="Paste text. Structure is preserved as a single section if none is provided."
    >
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
            className="mt-1.5 h-11 w-full rounded-md border border-border bg-elevated px-3 text-sm text-fg"
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
        {mut.isError ? <p className="text-sm text-danger">Indexing failed. Try again.</p> : null}
        <Button type="submit" disabled={mut.isPending || !title.trim() || !text.trim()}>
          {mut.isPending ? "Indexing…" : "Index"}
        </Button>
      </form>
    </Sheet>
  );
}
