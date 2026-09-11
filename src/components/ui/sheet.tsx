import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = "right",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  side?: "right" | "left";
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-bg/70 data-[state=open]:animate-in" />
        <Dialog.Content
          className={cn(
            "fixed top-0 z-50 flex h-dvh w-full max-w-lg flex-col border-border bg-surface shadow-[var(--shadow-border)]",
            "transition-transform duration-300 ease-[var(--ease-out)]",
            side === "right" ? "right-0 border-l" : "left-0 border-r",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <Dialog.Title className="font-display text-xl text-fg">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-muted">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="grid size-10 place-items-center rounded-md text-muted hover:bg-elevated hover:text-fg">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
