import * as React from "react"
import { cn } from "../../lib/utils"

const Badge = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' }>(({ className, variant = "default", ...props }, ref) => {
  const variants = {
    default: "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)] shadow hover:bg-[var(--primary)]/80",
    secondary: "border-transparent bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-[var(--secondary)]/80",
    destructive: "border-transparent bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:bg-[var(--destructive)]/80",
    outline: "text-[var(--foreground)]",
    success: "border-transparent bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 border-emerald-500/20",
    warning: "border-transparent bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 border-amber-500/20",
  };

  return (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  )
})

Badge.displayName = "Badge"

export { Badge }
