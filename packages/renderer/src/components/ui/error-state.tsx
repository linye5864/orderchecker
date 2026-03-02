import { AlertCircle, RefreshCcw } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "数据加载失败",
  message,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center min-h-[400px] text-center space-y-4", className)}>
      <div className="p-4 bg-red-50 rounded-full">
        <AlertCircle className="w-10 h-10 text-red-500" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-gray-900 leading-none">{title}</h3>
        {message && <p className="text-sm text-red-600 mt-2 max-w-md">{message}</p>}
      </div>
      {onRetry && (
        <Button onClick={onRetry} variant="default">
          <RefreshCcw className="mr-2 h-4 w-4" /> 重新试试
        </Button>
      )}
    </div>
  );
}
