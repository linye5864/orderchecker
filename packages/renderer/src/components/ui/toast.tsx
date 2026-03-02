import * as React from "react";
import { cn } from "@/lib/utils";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";

export type ToastVariant = "default" | "success" | "error" | "warning" | "info";

export type ToastProps = {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  onClose: (id: string) => void;
};

const icons: Record<ToastVariant, React.ReactNode> = {
  default: null,
  success: <CheckCircle className="h-5 w-5 text-green-500" />,
  error: <AlertCircle className="h-5 w-5 text-red-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
  info: <Info className="h-5 w-5 text-blue-500" />,
};

const variantStyles: Record<ToastVariant, string> = {
  default: "border bg-background",
  success: "border-green-500/20 bg-green-500/10",
  error: "border-red-500/20 bg-red-500/10",
  warning: "border-yellow-500/20 bg-yellow-500/10",
  info: "border-blue-500/20 bg-blue-500/10",
};

export function Toast({ id, title, description, variant = "default", onClose }: ToastProps) {
  React.useEffect(() => {
    const duration = 5000;
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, onClose]);

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg shadow-lg border transition-all duration-300 animate-in slide-in-from-right-full",
        variantStyles[variant]
      )}
      role="alert"
    >
      {variant !== "default" && icons[variant]}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onClose(id)}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export type ToastItem = {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
};
