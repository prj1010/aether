import { useMutation } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ingestDocument, ingestUpload, updateDocument } from "@/lib/server/aether";
import { COLLECTION_LABEL, type CollectionId } from "@/lib/rag/types";
import { cn } from "@/lib/utils";

const COLLECTIONS: CollectionId[] = [
  "policy",
  "architecture",
  "people",
  "security",
  "product",
  "operations",
];

export function FilterChip({
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

export function IngestSheet({
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
  const [filename, setFilename] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const mut = useMutation({
    mutationFn: async () => {
      if (file) {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        return ingestUpload({
          data: {
            title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
            filename: file.name,
            collection,
            bytesBase64: btoa(bin),
          },
        });
      }
      return ingestDocument({
        data: {
          title,
          filename: filename || `${title.replace(/\s+/g, "-").toLowerCase() || "note"}.txt`,
          collection,
          text,
        },
      });
    },
    onSuccess: () => {
      setTitle("");
      setText("");
      setFilename("");
      setFile(null);
      setLocalError(null);
      onDone();
    },
  });

  function takeFile(next: File | undefined) {
    if (!next) return;
    setLocalError(null);
    if (next.size > 2_000_000) {
      setLocalError("File is over 2 MB. Split it or paste the relevant section.");
      return;
    }
    setFile(next);
    setFilename(next.name);
    if (!title.trim()) setTitle(next.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
    const ext = next.name.split(".").pop()?.toLowerCase() ?? "";
    if (["txt", "md", "markdown", "csv", "json", "html", "htm", "log"].includes(ext)) {
      void next.text().then((body) => setText(body.slice(0, 80_000)));
    } else {
      setText("");
    }
  }

  const canSubmit = Boolean(file) || (title.trim() && text.trim());

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Upload document"
      description="Index a file into the corpus. Text, Markdown, PDF, and Word are supported."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) mut.mutate();
        }}
      >
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept=".txt,.md,.markdown,.csv,.json,.html,.htm,.pdf,.docx,.log"
          onChange={(e) => takeFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            takeFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center",
            drag ? "border-accent bg-elevated text-fg" : "border-border bg-elevated/60 text-muted hover:text-fg",
          )}
        >
          <Upload className="size-5" />
          <span className="text-sm">{file ? file.name : "Drop a file or browse"}</span>
          <span className="font-mono text-micro uppercase tracking-kicker text-dim">
            txt · md · pdf · docx · 2 MB
          </span>
        </button>
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
          <Textarea
            className="mt-1.5 min-h-40"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (file && e.target.value) setFile(null);
            }}
            placeholder={file ? "Text will be extracted from the file on index." : "Or paste text"}
          />
        </label>
        {localError ? <p className="text-sm text-danger">{localError}</p> : null}
        {mut.isError ? (
          <p className="text-sm text-danger">
            {mut.error instanceof Error ? mut.error.message : "Indexing failed. Try a .txt or .md file."}
          </p>
        ) : null}
        <Button type="submit" disabled={mut.isPending || !canSubmit}>
          {mut.isPending ? "Indexing…" : "Index"}
        </Button>
      </form>
    </Sheet>
  );
}

export function EditForm({
  id,
  title: initialTitle,
  filename,
  collection: initialCollection,
  text: initialText,
  onCancel,
  onSaved,
}: {
  id: string;
  title: string;
  filename: string;
  collection: CollectionId;
  text: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [collection, setCollection] = useState<CollectionId>(initialCollection);
  const [text, setText] = useState(initialText);
  const mut = useMutation({
    mutationFn: () =>
      updateDocument({
        data: { id, title, collection, text, filename },
      }),
    onSuccess: onSaved,
  });
  return (
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
        <Textarea className="mt-1.5 min-h-48" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {mut.isError ? (
        <p className="text-sm text-danger">
          {mut.error instanceof Error ? mut.error.message : "Could not save the document."}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={mut.isPending || !title.trim() || !text.trim()}>
          {mut.isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={mut.isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
