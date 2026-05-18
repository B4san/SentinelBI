import * as React from "react"
import { motion } from "motion/react"
import { cn } from "../../lib/utils"

const buttonVariants = {
  base: "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-50",
  variants: {
    variant: {
      default: "bg-[var(--primary)] text-[var(--primary-foreground)] soft-shadow hover:bg-[var(--primary)]/90 hover:-translate-y-0.5",
      destructive: "bg-[var(--destructive)] text-[var(--destructive-foreground)] shadow-sm hover:bg-[var(--destructive)]/90",
      outline: "border border-gray-200 bg-white hover:bg-gray-50 hover:text-gray-900",
      secondary: "bg-[var(--secondary)] text-[var(--secondary-foreground)] shadow-sm hover:bg-[var(--secondary)]/80",
      ghost: "hover:bg-gray-100 hover:text-gray-900 text-gray-500",
      link: "text-[var(--primary)] underline-offset-4 hover:underline",
      glass: "bg-white/50 backdrop-blur-md text-[var(--foreground)] hover:bg-white/80 border border-white/20",
    },
    size: {
      default: "h-11 px-6 py-2",
      sm: "h-9 rounded-full px-4 text-xs",
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
        className={cn(buttonVariants.base, buttonVariants.variants.variant[variant as keyof typeof buttonVariants.variants.variant], buttonVariants.variants.size[size as keyof typeof buttonVariants.variants.size], className)}
        ref={ref}
        {...(props as any)}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
