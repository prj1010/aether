import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { CollectionId } from "@/lib/rag/types";

const SIZE = 24;

function Frame({
  children,
  className,
  size,
  label,
  decorative,
}: {
  children: ReactNode;
  className?: string;
  size: number;
  label: string;
  decorative?: boolean;
}) {
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={size}
      height={size}
      className={cn("shrink-0 text-accent", className)}
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      fill="none"
    >
      {children}
    </svg>
  );
}

function Node({
  cx,
  cy,
  r = 1.7,
  accent = false,
}: {
  cx: number;
  cy: number;
  r?: number;
  accent?: boolean;
}) {
  return <circle cx={cx} cy={cy} r={r} className={accent ? "fill-fg" : "fill-accent"} />;
}

const MARKS: Record<CollectionId, { label: string; body: ReactNode }> = {
  policy: {
    label: "Policy",
    body: (
      <>
        <path
          d="M12 4.5 18.5 7.5v6.2c0 3.4-2.8 5.6-6.5 7.3-3.7-1.7-6.5-3.9-6.5-7.3V7.5Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <Node cx={12} cy={12} accent />
      </>
    ),
  },
  architecture: {
    label: "Architecture",
    body: (
      <>
        <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
          <line x1="12" y1="5" x2="19" y2="10" />
          <line x1="12" y1="5" x2="5" y2="10" />
          <line x1="5" y1="10" x2="12" y2="19" />
          <line x1="19" y1="10" x2="12" y2="19" />
          <line x1="5" y1="10" x2="19" y2="10" />
        </g>
        <Node cx={12} cy={5} accent />
        <Node cx={5} cy={10} />
        <Node cx={19} cy={10} />
        <Node cx={12} cy={19} />
      </>
    ),
  },
  people: {
    label: "People",
    body: (
      <>
        <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
          <line x1="12" y1="6" x2="6" y2="17" />
          <line x1="12" y1="6" x2="18" y2="17" />
          <line x1="6" y1="17" x2="18" y2="17" />
        </g>
        <Node cx={12} cy={6} accent />
        <Node cx={6} cy={17} />
        <Node cx={18} cy={17} />
      </>
    ),
  },
  security: {
    label: "Security",
    body: (
      <>
        <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4.5 19 12l-7 7.5L5 12Z" />
          <circle cx="12" cy="12" r="2.4" />
        </g>
        <Node cx={12} cy={4.5} accent />
        <Node cx={19} cy={12} />
        <Node cx={12} cy={19.5} />
        <Node cx={5} cy={12} />
      </>
    ),
  },
  product: {
    label: "Product",
    body: (
      <>
        <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
          <rect x="6" y="6" width="12" height="12" rx="1.5" />
          <line x1="12" y1="6" x2="12" y2="18" />
          <line x1="6" y1="12" x2="18" y2="12" />
        </g>
        <Node cx={12} cy={12} accent />
      </>
    ),
  },
  operations: {
    label: "Operations",
    body: (
      <>
        <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 8.5A6 6 0 0 1 18 12" />
          <path d="M17 15.5A6 6 0 0 1 6 12" />
          <polyline points="15.2,8.2 18,12 14.4,11.1" />
          <polyline points="8.8,15.8 6,12 9.6,12.9" />
        </g>
        <Node cx={12} cy={12} accent />
      </>
    ),
  },
};

export function CollectionMark({
  id,
  size = 20,
  className,
  decorative,
}: {
  id: CollectionId;
  size?: number;
  className?: string;
  decorative?: boolean;
}) {
  const mark = MARKS[id];
  return (
    <Frame size={size} className={className} label={mark.label} decorative={decorative}>
      {mark.body}
    </Frame>
  );
}

export function CollectionGlyph({
  id,
  className,
}: {
  id: CollectionId;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-9 place-items-center rounded-md bg-elevated text-accent",
        className,
      )}
    >
      <CollectionMark id={id} size={18} decorative />
    </span>
  );
}

/** Four-room palace plan used as a quiet Memory header asset. */
export function PalaceDiagram({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 280 88"
      className={cn("text-accent", className)}
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="0.9" opacity="0.7">
        <rect x="8" y="10" width="124" height="32" rx="3" />
        <rect x="148" y="10" width="124" height="32" rx="3" />
        <rect x="8" y="46" width="124" height="32" rx="3" />
        <rect x="148" y="46" width="124" height="32" rx="3" />
        <line x1="132" y1="26" x2="148" y2="26" />
        <line x1="70" y1="42" x2="70" y2="46" />
        <line x1="210" y1="42" x2="210" y2="46" />
      </g>
      <g className="fill-fg" fontFamily="IBM Plex Mono, ui-monospace, monospace" fontSize="8">
        <text x="16" y="29" opacity="0.7">
          L0 identity
        </text>
        <text x="156" y="29" opacity="0.7">
          L1 story
        </text>
        <text x="16" y="65" opacity="0.7">
          L2 rooms
        </text>
        <text x="156" y="65" opacity="0.7">
          L3 drawers
        </text>
      </g>
      <circle cx="120" cy="26" r="2.2" className="fill-accent" />
      <circle cx="160" cy="26" r="2.2" className="fill-accent" />
      <circle cx="70" cy="58" r="2.2" className="fill-fg" />
      <circle cx="210" cy="58" r="2.2" className="fill-accent" />
    </svg>
  );
}

const PIPELINE = ["Classify", "Route", "Retrieve", "Rerank", "Generate"] as const;

export function PipelineMark({
  active = 0,
  className,
}: {
  active?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 16"
      className={cn("text-accent", className)}
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="1" opacity="0.5">
        <line x1="8" y1="8" x2="112" y2="8" />
      </g>
      {PIPELINE.map((_, i) => (
        <circle
          key={PIPELINE[i]}
          cx={8 + i * 26}
          cy={8}
          r={i === active ? 3.2 : 2.2}
          className={i === active ? "fill-fg" : "fill-accent"}
        />
      ))}
    </svg>
  );
}

export { PIPELINE };
