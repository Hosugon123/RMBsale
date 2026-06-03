import { Navigate } from "react-router-dom";
import { useAppStore } from "../features/AppStore";
import { hasPermission } from "../lib/permissions";
import type { AppUser } from "../lib/types";

export function isAdmin(user: AppUser) {
  return hasPermission(user, "admin");
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { sessionUser } = useAppStore();

  if (!isAdmin(sessionUser)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
