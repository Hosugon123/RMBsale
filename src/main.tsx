import React from "react";
import ReactDOM from "react-dom/client";
import { initTheme } from "./lib/theme";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AdminRoute } from "./components/AdminRoute";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { SaleModalHost } from "./components/SaleModalHost";
import { SettlementModalHost } from "./components/SettlementModalHost";
import { TransferModalHost } from "./components/TransferModalHost";
import { AuthProvider } from "./context/AuthContext";
import { AppStoreProvider } from "./features/AppStore";
import { ThemeProvider } from "./features/ThemeProvider";
import { DashboardPage } from "./pages/DashboardPage";
import { PurchasePage } from "./pages/PurchasePage";
import { SalePage } from "./pages/SalePage";
import { ReceivablesPage } from "./pages/ReceivablesPage";
import { AccountsPage } from "./pages/AccountsPage";
import { LedgerPage } from "./pages/LedgerPage";
import { InventoryPage } from "./pages/InventoryPage";
import { AdminPage } from "./pages/AdminPage";
import { BackupAuditPage } from "./pages/BackupAuditPage";
import { LoginPage } from "./pages/LoginPage";
import "./styles/globals.css";

initTheme();

const queryClient = new QueryClient();

function AppRoutes() {
  const appShell = (
    <AppStoreProvider>
      <TransferModalHost />
      <SettlementModalHost />
      <SaleModalHost />
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="purchase" element={<PurchasePage />} />
          <Route path="sale" element={<SalePage />} />
          <Route path="receivables" element={<ReceivablesPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="account" element={<AccountsPage />} />
          <Route path="ledger" element={<LedgerPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route
            path="admin"
            element={
              <AdminRoute>
                <AdminPage />
              </AdminRoute>
            }
          />
          <Route
            path="admin/backup"
            element={
              <AdminRoute>
                <BackupAuditPage />
              </AdminRoute>
            }
          />
        </Route>
      </Routes>
    </AppStoreProvider>
  );

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={<ProtectedRoute>{appShell}</ProtectedRoute>} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
