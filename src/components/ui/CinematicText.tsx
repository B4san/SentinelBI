"use client";

import * as React from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

import { cn } from "@/src/lib/utils";

export type CinematicTextProps = {
  children: string;
  as?: "p" | "span" | "div" | "h1" | "h2" | "h3" | "h4";
  delay?: number;
  stagger?: number;
  blur?: number;
  once?: boolean;
  className?: string;
};

const CINEMA = [0.16, 1, 0.3, 1] as const;

export function CinematicText({
  children,
  as = "h1",
  delay = 0.2,
  stagger = 0.11,
  blur = 28,
  once = true,
  className,
}: CinematicTextProps) {
  const reduced = !!useReducedMotion();
  const ref = React.useRef<HTMLElement>(null);
  const inView = useInView(ref, { once, margin: "0px 0px -10% 0px" });
  const words = React.useMemo(() => children.split(/\s+/).filter(Boolean), [children]);
  const Tag = as as React.ElementType;

  return (
    <Tag ref={ref} className={cn("text-balance", className)}>
      <span className="sr-only">{children}</span>
      {reduced ? (
        <motion.span
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: inView ? 1 : 0 }}
          transition={{ duration: 0.22, ease: "easeOut", delay }}
        >
          {children}
        </motion.span>
      ) : (
        <span aria-hidden>
          {words.map((word, i) => (
            <motion.span
              key={`${word}-${i}`}
              className="inline-block will-change-[filter,transform]"
              initial={{ opacity: 0, y: 22, scale: 1.04, filter: `blur(${blur}px)` }}
              animate={
                inView
                  ? { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
                  : { opacity: 0, y: 22, scale: 1.04, filter: `blur(${blur}px)` }
              }
              transition={{ duration: 1.4, delay: delay + i * stagger, ease: CINEMA }}
            >
              {word}
              {i < words.length - 1 ? "\u00a0" : ""}
            </motion.span>
          ))}
        </span>
      )}
    </Tag>
  );
}

CinematicText.displayName = "CinematicText";
