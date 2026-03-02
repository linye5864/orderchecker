import * as React from "react";
import { Toast, ToastItem, ToastVariant } from "./toast";

type ToastContextValue = {
  toasts: ToastItem[];
  showToast: (title: string, description?: string, variant?: ToastVariant) => void;
  hideToast: (id: string) => void;
};

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const showToast = React.useCallback(
    (title: string, description?: string, variant: ToastVariant = "default") => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, title, description, variant }]);
    },
    []
  );

  const hideToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, hideToast }}>
      {children}
      {/* Toast Container - Fixed position in top-right corner */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-96 pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast
              id={toast.id}
              title={toast.title}
              description={toast.description}
              variant={toast.variant}
              onClose={hideToast}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Global toast instance for easy access
let globalToastInstance: ((title: string, description?: string, variant?: ToastVariant) => void) | null = null;

export function setGlobalToast(toastFn: (title: string, description?: string, variant?: ToastVariant) => void) {
  globalToastInstance = toastFn;
}

// Convenience functions
export function showToast(title: string, description?: string, variant: ToastVariant = "default") {
  if (globalToastInstance) {
    globalToastInstance(title, description, variant);
  }
}

export function showSuccess(title: string, description?: string) {
  showToast(title, description, "success");
}

export function showError(title: string, description?: string) {
  showToast(title, description, "error");
}

export function showWarning(title: string, description?: string) {
  showToast(title, description, "warning");
}

export function showInfo(title: string, description?: string) {
  showToast(title, description, "info");
}
