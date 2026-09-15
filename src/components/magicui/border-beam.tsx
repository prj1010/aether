"use client";

import { motion, type MotionStyle } from "motion/react";
import { cn } from "@/lib/utils";

export function BorderBeam({
  className,
  size = 56,
  duration = 8,
  delay = 0,
  colorFrom = "var(--color-accent)",
  colorTo = "var(--color-fg)",
  borderWidth = 1,
}: {
  className?: string;
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  borderWidth?: number;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[inherit] border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]"
      style={{ borderWidth }}
    >
      <motion.div
        className={cn("absolute aspect-square bg-gradient-to-l to-transparent", className)}
        style={
          {
            width: size,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            backgroundImage: `linear-gradient(to left, ${colorFrom}, ${colorTo}, transparent)`,
          } as MotionStyle
        }
        initial={{ offsetDistance: "0%" }}
        animate={{ offsetDistance: "100%" }}
        transition={{ duration, repeat: Infinity, ease: "linear", delay: -delay }}
      />
    </div>
  );
}
