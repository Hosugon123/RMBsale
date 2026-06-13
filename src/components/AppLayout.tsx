import * as React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ArrowLeftRight, Banknote, Boxes, CheckCircle2, HandCoins, Landmark, LayoutDashboard, LogOut, Menu, ReceiptText, Settings, Users, Wallet, X } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";
import { openSaleModal } from "./SaleModalHost";
import { openSettlementModal } from "./SettlementModalHost";
import { openAccountTransferModal } from "./TransferModalHost";
import { PermissionRoute } from "./PermissionRoute";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { useAppStore } from "../features/AppStore";
import { PullToRefresh } from "./PullToRefresh";
import { detectLevel, hasPermission, levelLabel, permissionForPath } from "../lib/permissions";

const baseNav = [
  { to: "/", label: "儀表板", icon: LayoutDashboard },
  { to: "/purchase", label: "買入登記", icon: Banknote },
  { to: "/sale", label: "售出錄入", icon: HandCoins },
  { to: "/receivables", label: "應收應付", icon: Users },
  { to: "/special-client-wallet", label: "儲值代付", icon: Wallet },
  { to: "/accounts", label: "帳務管理", icon: Landmark },
  { to: "/ledger", label: "現金流水", icon: ReceiptText },
  { to: "/inventory", label: "FIFO 庫存", icon: Boxes }
];

const adminNavItem = { to: "/admin", label: "管理後台", icon: Settings };

export function AppLayout() {
  const [open, setOpen] = React.useState(false);
  const { sessionUser, refresh } = useAppStore();
  const { logout } = useAuth();
  const location = useLocation();

  const nav = React.useMemo(
    () =>
      baseNav.filter((item) => {
        const permission = permissionForPath(item.to);
        return permission ? hasPermission(sessionUser, permission) : true;
      }),
    [sessionUser]
  );

  const showAdminLink = hasPermission(sessionUser, "admin");
  const sessionLevel = levelLabel(detectLevel(sessionUser.permissions));

  const pageTitle = React.useMemo(() => {
    if (location.pathname === "/" || location.pathname === "") return "儀表板";
    if (location.pathname === "/account" || location.pathname === "/accounts") return "帳務管理";
    if (location.pathname === "/special-client-wallet") return "儲值代付";
    if (location.pathname === "/admin") return adminNavItem.label;
    return nav.find((item) => item.to === location.pathname)?.label ?? "RMBsale";
  }, [location.pathname, nav]);

  const goToAccountTransfer = () => {
    openAccountTransferModal();
  };

  const handleLogout = () => {
    setOpen(false);
    void logout().then(() => {
      window.location.assign("/login");
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="關閉選單"
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r shadow-xl",
          "border-slate-200 bg-white text-slate-900",
          "dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100",
          "lg:z-40 lg:translate-x-0 lg:shadow-none",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div
          className={cn(
            "flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4",
            "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
          )}
        >
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">RMBsale</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">金流記帳系統</p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <ThemeToggle className="text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800" />
            <Button className="lg:hidden" variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-inherit p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
                  "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  "dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
                  isActive && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div
          className={cn(
            "shrink-0 space-y-3 border-t p-4",
            "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
          )}
        >
          {showAdminLink ? (
            <NavLink
              to={adminNavItem.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
                  "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  "dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
                  isActive && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                )
              }
            >
              <adminNavItem.icon className="h-4 w-4" />
              {adminNavItem.label}
            </NavLink>
          ) : null}
          <button
            type="button"
            onClick={handleLogout}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
              "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              "dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            )}
          >
            <LogOut className="h-4 w-4" />
            登出
          </button>
          <div>
            <Badge tone="muted" className="mb-2">
              {sessionLevel}
            </Badge>
            <p className="text-sm font-medium">{sessionUser.displayName}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">@{sessionUser.username}</p>
          </div>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 min-w-0 items-center justify-between gap-1 border-b bg-background px-2 sm:gap-2 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Button className="shrink-0 lg:hidden" variant="outline" size="icon" onClick={() => setOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <p className="truncate text-sm font-semibold sm:text-base">{pageTitle}</p>
          </div>
          <div className="flex shrink-0 flex-row flex-nowrap items-center gap-0.5 sm:gap-2">
            {hasPermission(sessionUser, "sale") ? (
            <Button
              className="h-8 shrink-0 gap-1 whitespace-nowrap px-2 text-xs sm:gap-2 sm:px-3 sm:text-sm"
              variant="outline"
              size="sm"
              title="售出"
              onClick={openSaleModal}
            >
              <HandCoins className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
              <span>售出</span>
            </Button>
            ) : null}
            {hasPermission(sessionUser, "receivables") ? (
            <Button
              className="h-8 shrink-0 gap-1 whitespace-nowrap px-2 text-xs sm:gap-2 sm:px-3 sm:text-sm"
              variant="outline"
              size="sm"
              title="收帳"
              onClick={() => openSettlementModal()}
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
              <span>收帳</span>
            </Button>
            ) : null}
            {hasPermission(sessionUser, "transfer") ? (
            <Button
              className="h-8 shrink-0 gap-1 whitespace-nowrap px-2 text-xs sm:gap-2 sm:px-3 sm:text-sm"
              variant="outline"
              size="sm"
              title="轉帳"
              onClick={goToAccountTransfer}
            >
              <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
              <span>轉帳</span>
            </Button>
            ) : null}
            <Button
              className="h-8 shrink-0 gap-1 px-2 text-xs sm:text-sm"
              variant="ghost"
              size="sm"
              title="登出"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">登出</span>
            </Button>
          </div>
        </header>
        <PullToRefresh onRefresh={refresh}>
          <main className="min-w-0 overflow-x-hidden p-3 sm:p-4 lg:p-6">
            <PermissionRoute>
              <Outlet />
            </PermissionRoute>
          </main>
        </PullToRefresh>
      </div>
    </div>
  );
}
