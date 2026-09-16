import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { CollectionGlyph } from "@/components/collection-mark";
import { BlurFade } from "@/components/magicui/blur-fade";
import { PageCanvas, PageHeader } from "@/components/page-header";
import { Tile, TileHint, TileMeta, TileTitle } from "@/components/tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteDocument,
  getDoc,
  ingestDocument,
  ingestUpload,
  listDocs,
  updateDocument,
} from "@/lib/server/aether";
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
