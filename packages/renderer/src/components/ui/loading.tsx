import { RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Spinner({ className, size = "md" }: SpinnerProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  };

  return (
    <RefreshCcw
      className={cn("text-primary-500 animate-spin", sizeClasses[size], className)}
    />
  );
}

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({ message = "加载中...", className }: LoadingStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center min-h-[400px] space-y-4", className)}>
      <Spinner size="lg" />
      <div className="text-base text-gray-500 font-medium">{message}</div>
    </div>
  );
}
