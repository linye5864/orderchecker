import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant = 
  | "success" 
  | "warning" 
  | "error" 
  | "info"
  | "default"
  | "secondary"
  | "destructive"
  | "outline";

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({ variant = "default", className, ...props }: BadgeProps) {
  const variantClass = (() => {
    switch (variant) {
      case "success":
        return "status-success";
      case "warning":
        return "status-warning";
      case "error":
        return "status-error";
      case "info":
        return "status-info";
      case "destructive":
        return "bg-red-500 text-white";
      case "secondary":
        return "bg-secondary text-secondary-foreground";
      case "outline":
        return "border border-input bg-background hover:bg-accent";
      default:
        return "bg-primary text-primary-foreground";
    }
  })();

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
        variantClass,
        className
      )}
      {...props}
    />
  );
}
