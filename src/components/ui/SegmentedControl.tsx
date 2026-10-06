"use client";

import * as React from "react";
import {
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
  useMotionValue,
  useVelocity,
} from "motion/react";
import { cn } from "@/src/lib/utils";

export interface SegmentedControlOption {
  label: string;
  value: string;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
}

const PILL_SPRING  = { stiffness: 380, damping: 24, mass: 0.6 } as const;
const WIDTH_SPRING = { stiffness: 400, damping: 28, mass: 0.5 } as const;
const LABEL_SPRING = { type: "spring", stiffness: 400, damping: 28, mass: 0.5 } as const;
const PRESS_SPRING = { stiffness: 600, damping: 22, mass: 0.4 } as const;
const ICON_INACTIVE_TRANSITION = { duration: 0.2, ease: "easeOut" } as const;

export function SegmentedControl({
  options,
  value,
  onChange,
  className,
  id,
}: SegmentedControlProps) {
  const prefersReducedMotion = useReducedMotion();
  const reactId = React.useId();
  const tablistId = id ?? reactId;
  const buttonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const activeIndex = Math.max(options.findIndex((o) => o.value === value), 0);

  const rawX = useMotionValue(0);
  const rawW = useMotionValue(0);

  const springX = useSpring(rawX, PILL_SPRING);
  const springW = useSpring(rawW, WIDTH_SPRING);

  const velX = useVelocity(springX);

  const stretch = useTransform(velX, (v) => Math.min(Math.abs(v) * 0.04, 12));

  const pillW = useTransform(
    [springW, stretch],
    ([w, s]: number[]) => w + s
  );
  const pillX = useTransform(
    [springX, stretch],
    ([x, s]: number[]) => Math.max(0, x - s / 2)
  );
  const pillBlur = useTransform(
    velX,
    (v) => `blur(${Math.min(Math.abs(v) * 0.011, 5)}px)`
  );

  const [isSafari, setIsSafari] = React.useState(false);
  React.useEffect(() => {
    setIsSafari(/^((?!chrome|android).)*safari/i.test(navigator.userAgent));
  }, []);

  const [ready, setReady] = React.useState(false);
  const [sepPositions, setSepPositions] = React.useState<number[]>([]);
  const isFirst = React.useRef(true);

  const measure = React.useCallback(() => {
    const btn = buttonRefs.current[activeIndex];
    const container = containerRef.current;
    if (!btn || !container) return;

    const x = btn.offsetLeft;
    const w = btn.offsetWidth;

    if (isFirst.current) {
      rawX.jump(x); rawW.jump(w);
      isFirst.current = false;
    } else {
      rawX.set(x); rawW.set(w);
    }

    const pos: number[] = [];
    for (let i = 0; i < options.length - 1; i++) {
      const b = buttonRefs.current[i];
      if (b) pos.push(b.offsetLeft + b.offsetWidth);
    }
    setSepPositions(pos);
    setReady(true);
  }, [activeIndex, options.length, rawX, rawW]);

  const optionsKey = options.map((o) => `${o.value}:${o.label}`).join("|");

  React.useLayoutEffect(() => { measure(); }, [measure, optionsKey]);

  React.useEffect(() => {
    const ro = new ResizeObserver(() => { isFirst.current = true; measure(); });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const focusByIndex = (i: number) => buttonRefs.current[i]?.focus();
  const selectByIndex = (i: number) => { const o = options[i]; if (o) onChange(o.value); };
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (!options.length) return;
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    if (e.key === "Home") { selectByIndex(0); focusByIndex(0); return; }
    if (e.key === "End") { const l = options.length - 1; selectByIndex(l); focusByIndex(l); return; }
    const next = (idx + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
    selectByIndex(next); focusByIndex(next);
  };

  if (!options.length) return null;

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        "relative inline-flex w-full items-center select-none",
        "rounded-full p-[3px] gap-0",
        "border border-black/20 bg-black/8",
        "dark:border-white/20 dark:bg-white/[0.05]",
        className,
      )}
      style={{ isolation: "isolate" }}
    >
      {ready && !prefersReducedMotion && (
        <motion.span
          aria-hidden
          style={{
            position: "absolute",
            top: 3,
            bottom: 3,
            left: 0,
            borderRadius: 9999,
            pointerEvents: "none",
            x: pillX,
            width: pillW,
            filter: isSafari ? undefined : pillBlur,
          }}
          className={cn(
            "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.14),0_1px_1px_rgba(0,0,0,0.07),inset_0_0_0_0.5px_rgba(255,255,255,0.9)]",
            "border border-black/16",
            "dark:bg-white/[0.16] dark:border-white/20 dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)]",
          )}
        />
      )}

      {ready && prefersReducedMotion && (
        <span
          aria-hidden
          className={cn(
            "absolute rounded-full pointer-events-none",
            "bg-white border border-black/16 shadow-[0_1px_3px_rgba(0,0,0,0.14)]",
            "dark:bg-white/[0.16] dark:border-white/20",
          )}
          style={{ top: 3, bottom: 3, left: rawX.get(), width: rawW.get() }}
        />
      )}

      {sepPositions.map((x, i) => {
        const adjacent = i === activeIndex - 1 || i === activeIndex;
        return (
          <motion.span
            key={i}
            aria-hidden
            animate={{ opacity: adjacent ? 0 : 1, scaleY: adjacent ? 0.3 : 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="absolute top-[20%] bottom-[20%] w-px pointer-events-none origin-center bg-black/8 dark:bg-white/10"
            style={{ left: x }}
          />
        );
      })}

      {options.map((option, index) => (
        <TabButton
          key={option.value}
          ref={(node) => { buttonRefs.current[index] = node; }}
          option={option}
          isActive={index === activeIndex}
          tablistId={tablistId}
          prefersReducedMotion={!!prefersReducedMotion}
          disableBlur={isSafari}
          onClick={() => onChange(option.value)}
          onKeyDown={(e) => onKeyDown(e, index)}
        />
      ))}
    </div>
  );
}

interface TabButtonProps {
  option: SegmentedControlOption;
  isActive: boolean;
  tablistId: string;
  prefersReducedMotion: boolean;
  disableBlur: boolean;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}

const TabButton = React.forwardRef<HTMLButtonElement, TabButtonProps>(
  ({ option, isActive, tablistId, prefersReducedMotion, disableBlur, onClick, onKeyDown }, ref) => {
    const pressScale = useMotionValue(1);
    const springPressScale = useSpring(pressScale, PRESS_SPRING);

    const onDown   = () => { if (!prefersReducedMotion) pressScale.set(0.93); };
    const onUp     = () => { if (!prefersReducedMotion) pressScale.set(1); };

    return (
      <motion.button
        ref={ref}
        type="button"
        role="tab"
        id={`${tablistId}-${option.value}`}
        aria-selected={isActive}
        tabIndex={isActive ? 0 : -1}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onPointerCancel={onUp}
        style={{ scale: springPressScale }}
        className={cn(
          "relative z-10 inline-flex min-w-0 flex-1 items-center justify-center gap-2",
          "rounded-full px-4 py-2.5 text-sm leading-none",
          "cursor-pointer border-none bg-transparent outline-none",
          "focus-visible:ring-2 focus-visible:ring-zinc-900/20 dark:focus-visible:ring-zinc-100/20 dark:focus-visible:ring-white/25",
        )}
      >
        <motion.span
          animate={{
            opacity: isActive ? 1 : 0.55,
            scale:   isActive ? 1 : 0.975,
          }}
          transition={prefersReducedMotion ? { duration: 0 } : LABEL_SPRING}
          className="inline-flex items-center gap-2"
        >
          {option.icon && (
            <motion.div
              initial={false}
              animate={
                prefersReducedMotion
                  ? { opacity: isActive ? 1 : 0.7, y: 0, scale: 1 }
                  : isActive
                    ? {
                        opacity: [0.86, 1, 1],
                        y: [0, -1.5, 0],
                        scale: [1, 1.035, 1],
                        ...(disableBlur
                          ? {}
                          : { filter: ["blur(1.5px)", "blur(0px)", "blur(0px)"] }),
                      }
                    : { opacity: 0.7, y: 0, scale: 1, ...(disableBlur ? {} : { filter: "blur(0px)" }) }
              }
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : isActive
                    ? {
                        y: { duration: 0.36, times: [0, 0.42, 1], ease: "easeOut" },
                        scale: { duration: 0.36, times: [0, 0.42, 1], ease: "easeOut" },
                        opacity: { duration: 0.2, ease: "easeOut" },
                        filter: { duration: 0.22, ease: "easeOut" },
                      }
                    : ICON_INACTIVE_TRANSITION
              }
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center will-change-transform"
            >
              {option.icon}
            </motion.div>
          )}
          <span
            className={cn(
              "transition-[font-weight] duration-0",
              isActive
                ? "font-semibold text-zinc-900 dark:text-zinc-100"
                : "font-medium text-zinc-900/70 dark:text-zinc-100/70",
            )}
          >
            {option.label}
          </span>
        </motion.span>
      </motion.button>
    );
  }
);
TabButton.displayName = "TabButton";
