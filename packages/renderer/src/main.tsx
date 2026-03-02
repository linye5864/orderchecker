import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes, Navigate, Outlet, useLocation } from "react-router-dom";
import AppShell from "./views/AppShell";
import Login from "./views/Login";
import UploadPage from "./pages/UploadPage";
import ReconciliationPage from "./pages/ReconciliationPage";
import ResultsPage from "./pages/ResultsPage";
import DashboardPage from "./pages/DashboardPage";
import HistoryPage from "./pages/HistoryPage";
import PlatformsPage from "./pages/PlatformsPage";
import SettingsPage from "./pages/SettingsPage";
import DataviewPage from "./pages/DataviewPage";
import { ToastProvider, setGlobalToast, useToast } from "@/components/ui/toast-context";
import { isAuthenticated } from "./lib/api";
import "./globals.css";

type AuthLocationState = {
  from?: string;
};

function RequireAuth() {
  const location = useLocation();

  // 使用 api.ts 中的 isAuthenticated() 函数检查 Token 是否存在
  if (!isAuthenticated()) {
    const state: AuthLocationState = { from: location.pathname };
    return <Navigate to="/login" replace state={state} />;
  }

  return <Outlet />;
}

// Initialize toast provider and set global instance
function ToastAppWrapper({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();

  React.useEffect(() => {
    setGlobalToast(showToast);
  }, [showToast]);

  return <>{children}</>;
}

const App = () => {
  return (
    <ToastProvider>
      <ToastAppWrapper>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<RequireAuth />}>
              <Route path="/" element={<AppShell />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="upload" element={<UploadPage />} />
                <Route path="reconciliation" element={<ReconciliationPage />} />
                <Route path="results" element={<ResultsPage />} />
                <Route path="history" element={<HistoryPage />} />
                <Route path="platforms" element={<PlatformsPage />} />
                <Route path="dataview" element={<DataviewPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Route>
          </Routes>
        </HashRouter>
      </ToastAppWrapper>
    </ToastProvider>
  );
};

createRoot(document.getElementById("root")!).render(<App />);
