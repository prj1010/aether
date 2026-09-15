import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface TrackerBlock {
  key: string;
  color: string;
  tooltip: string;
}

export function Tracker({
  data,
  className,
}: {
  data: TrackerBlock[];
  className?: string;
}) {
  return (
    <div
      tremor-id="tremor-raw"
      className={cn("flex h-8 w-full items-stretch gap-px", className)}
      role="img"
      aria-label="Status tracker"
    >
      {data.map((block, i) => (
        <Tooltip key={block.key} content={block.tooltip}>
          <div
            className={cn(
              "h-full min-w-0 flex-1",
              i === 0 && "rounded-l-sm",
              i === data.length - 1 && "rounded-r-sm",
              block.color,
            )}
          />
        </Tooltip>
      ))}
    </div>
  );
}
