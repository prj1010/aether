import type { Citation } from "@/lib/rag/types";
import { useAether } from "@/lib/store";

export function AnswerBody({
  text,
  citations,
}: {
  text: string;
  citations?: Citation[];
}) {
  const setActive = useAether((s) => s.setActiveCitation);
  const parts = text.split(/(\[\d+\])/g);
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-fg/95">
      {parts.join("").split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />;
        const bits = line.split(/(\[\d+\])/g);
        return (
          <p key={i}>
            {bits.map((bit, j) => {
              const m = bit.match(/^\[(\d+)\]$/);
              if (!m) return <InlineMd key={j} text={bit} />;
              const n = Number(m[1]);
              const cit = citations?.find((c) => c.n === n);
              return (
                <button
                  key={j}
                  type="button"
                  onClick={() => cit && setActive(cit)}
                  className="mx-0.5 inline-flex translate-y-[-1px] items-center rounded-sm bg-elevated px-1 font-mono text-[11px] text-accent hover:bg-subtle"
                >
                  {n}
                </button>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}

function InlineMd({ text }: { text: string }) {
  const bits = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return (
    <>
      {bits.map((b, i) => {
        if (b.startsWith("**") && b.endsWith("**"))
          return (
            <strong key={i} className="font-medium">
              {b.slice(2, -2)}
            </strong>
          );
        if (b.startsWith("*") && b.endsWith("*"))
          return (
            <em key={i} className="italic">
              {b.slice(1, -1)}
            </em>
          );
        if (b.startsWith("`") && b.endsWith("`"))
          return (
            <code key={i} className="rounded-sm bg-elevated px-1 font-mono text-[13px]">
              {b.slice(1, -1)}
            </code>
          );
        return <span key={i}>{b}</span>;
      })}
    </>
  );
}
