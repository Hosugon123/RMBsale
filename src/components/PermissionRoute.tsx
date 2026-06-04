import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAppStore } from "../features/AppStore";
import { canAccessPath } from "../lib/permissions";

export function PermissionRoute({ children }: { children: ReactNode }) {
  const { sessionUser } = useAppStore();
  const location = useLocation();

  if (!canAccessPath(sessionUser, location.pathname)) {
    const target =
      ["/", "/purchase", "/sale", "/receivables", "/accounts", "/ledger", "/inventory", "/admin"].find((path) =>
        canAccessPath(sessionUser, path)
      ) ?? "/";
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}
