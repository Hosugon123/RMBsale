import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AdminRoute } from "./components/AdminRoute";
import { AppLayout } from "./components/AppLayout";
import { SaleModalHost } from "./components/SaleModalHost";
import { SettlementModalHost } from "./components/SettlementModalHost";
import { TransferModalHost } from "./components/TransferModalHost";
import { AppStoreProvider } from "./features/AppStore";
import { DashboardPage } from "./pages/DashboardPage";
import { PurchasePage } from "./pages/PurchasePage";
import { SalePage } from "./pages/SalePage";
import { ReceivablesPage } from "./pages/ReceivablesPage";
import { AccountsPage } from "./pages/AccountsPage";
import { LedgerPage } from "./pages/LedgerPage";
import { InventoryPage } from "./pages/InventoryPage";
import { AdminPage } from "./pages/AdminPage";
import "./styles/globals.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppStoreProvider>
        <BrowserRouter>
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
            </Route>
          </Routes>
        </BrowserRouter>
      </AppStoreProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
