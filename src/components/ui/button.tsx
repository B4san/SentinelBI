import * as React from "react"
import { motion } from "motion/react"
import { cn } from "../../lib/utils"

const buttonVariants = {
  base: "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-50",
  variants: {
    variant: {
      default: "bg-[#1e40af] text-white hover:bg-[#1d4ed8] hover:-translate-y-0.5 font-semibold",
      destructive: "bg-[var(--destructive)] text-[var(--destructive-foreground)] shadow-sm hover:bg-[var(--destructive)]/90",
      outline: "border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]",
      secondary: "bg-[var(--secondary)] text-[var(--secondary-foreground)] shadow-sm hover:bg-[var(--secondary)]/80",
      ghost: "hover:bg-[var(--secondary)] hover:text-[var(--foreground)] text-[var(--muted-foreground)]",
      link: "text-[var(--primary)] underline-offset-4 hover:underline",
      glass: "bg-white/50 backdrop-blur-md text-[var(--foreground)] hover:bg-white/80 border border-white/20",
    },
    size: {
      default: "h-11 px-6 py-2",
      sm: "h-10 rounded-full px-4 text-sm font-semibold",
      lg: "h-12 rounded-full px-8",
      icon: "h-11 w-11",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants.variants.variant
  size?: keyof typeof buttonVariants.variants.size
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    return (
      <motion.button
        whileTap={{ scale: 0.98 }}
        className={cn(buttonVariants.base, buttonVariants.variants.variant[variant], buttonVariants.variants.size[size], className)}
        ref={ref}
        {...(props as unknown as React.ComponentProps<typeof motion.button>)}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
