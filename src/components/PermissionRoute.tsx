import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAppStore } from "../features/AppStore";
import { canAccessPath } from "../lib/permissions";

const FALLBACK_PATHS = [
  "/",
  "/purchase",
  "/sale",
  "/receivables",
  "/special-client-wallet",
  "/accounts",
  "/ledger",
  "/inventory",
  "/admin"
] as const;

export function PermissionRoute({ children }: { children: ReactNode }) {
  const { sessionUser } = useAppStore();
  const location = useLocation();

  if (canAccessPath(sessionUser, location.pathname)) {
    return <>{children}</>;
  }

  const target = FALLBACK_PATHS.find((path) => canAccessPath(sessionUser, path)) ?? "/";
  if (target === location.pathname.replace(/\/+$/, "") || !canAccessPath(sessionUser, target)) {
    return (
      <div className="rounded-lg border border-border/80 bg-muted/20 px-4 py-10 text-center">
        <p className="text-base font-medium">您沒有此頁面的存取權限</p>
        <p className="mt-2 text-sm text-muted-foreground">請聯絡管理員開啟「特殊客戶代付」或其他業務權限。</p>
      </div>
    );
  }

  return <Navigate to={target} replace />;
}
