import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { CollectionGlyph } from "@/components/collection-mark";
import { BlurFade } from "@/components/magicui/blur-fade";
import { PageCanvas, PageHeader } from "@/components/page-header";
import { Tile, TileHint, TileMeta, TileTitle } from "@/components/tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { deleteDocument, getDoc, listDocs } from "@/lib/server/aether";
import { COLLECTION_LABEL, type CollectionId } from "@/lib/rag/types";
import { EditForm, FilterChip, IngestSheet } from "@/components/knowledge-forms";

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
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
          description="Indexed documents with versions, validity windows, and provenance. Edit or delete from the card or the document panel."
          actions={
            <Button variant="secondary" onClick={() => setShowIngest(true)}>
              <Plus className="size-4" />
              Upload document
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
                <Tile className="min-h-36">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => {
                        setEditing(false);
                        setConfirmDelete(false);
                        setOpenId(d.id);
                      }}
                    >
                      <CollectionGlyph id={d.collection} />
                    </button>
                    <Badge variant={d.status === "deprecated" ? "warn" : "ok"}>{d.status}</Badge>
                  </div>
                  <button
                    type="button"
                    className="mt-4 text-left"
                    onClick={() => {
                      setEditing(false);
                      setConfirmDelete(false);
                      setOpenId(d.id);
                    }}
                  >
                    <TileTitle>{d.title}</TileTitle>
                    <TileHint className="font-mono">{d.filename}</TileHint>
                  </button>
                  <TileMeta>
                    {COLLECTION_LABEL[d.collection]}
                    <span aria-hidden="true"> · </span>
                    v{d.version}
                    <span aria-hidden="true"> · </span>
                    {d.validFrom}
                  </TileMeta>
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setConfirmDelete(false);
                        setOpenId(d.id);
                        setEditing(true);
                      }}
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setEditing(false);
                        setOpenId(d.id);
                        setConfirmDelete(true);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  </div>
                </Tile>
              </BlurFade>
            ))}
          </div>
        )}
      </PageCanvas>

      <Sheet
        open={!!openId}
        onOpenChange={(o) => {
          if (!o) {
            setOpenId(null);
            setEditing(false);
            setConfirmDelete(false);
          }
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
        ) : detail.data && editing ? (
          <EditForm
            id={detail.data.document.id}
            title={detail.data.document.title}
            filename={detail.data.document.filename}
            collection={detail.data.document.collection}
            text={detail.data.document.content}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              void qc.invalidateQueries({ queryKey: ["docs"] });
              void qc.invalidateQueries({ queryKey: ["doc", openId] });
            }}
          />
        ) : detail.data ? (
          <div className="space-y-6">
            <div className="sticky top-0 z-10 -mx-5 -mt-4 space-y-3 border-b border-border bg-surface px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{COLLECTION_LABEL[detail.data.document.collection]}</Badge>
                <Badge variant={detail.data.document.status === "deprecated" ? "warn" : "ok"}>
                  {detail.data.document.status}
                </Badge>
                <Badge>v{detail.data.document.version}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil className="size-3.5" />
                  Edit document
                </Button>
                {confirmDelete ? (
                  <>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        void deleteDocument({ data: { id: detail.data!.document.id } }).then(() => {
                          setConfirmDelete(false);
                          setOpenId(null);
                          void qc.invalidateQueries({ queryKey: ["docs"] });
                        });
                      }}
                    >
                      Confirm delete
                    </Button>
                  </>
                ) : (
                  <Button type="button" size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="size-3.5" />
                    Delete document
                  </Button>
                )}
              </div>
              {confirmDelete ? (
                <p className="text-xs text-danger">This removes the document and its chunks from the live index.</p>
              ) : null}
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
