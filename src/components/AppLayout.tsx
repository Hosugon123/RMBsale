import * as React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ArrowLeftRight, Banknote, Boxes, CheckCircle2, HandCoins, Landmark, LayoutDashboard, LogOut, Menu, ReceiptText, Settings, Users, X } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";
import { openSaleModal } from "./SaleModalHost";
import { openSettlementModal } from "./SettlementModalHost";
import { openAccountTransferModal } from "./TransferModalHost";
import { PermissionRoute } from "./PermissionRoute";
import { useAppStore } from "../features/AppStore";
import { detectLevel, hasPermission, levelLabel, permissionForPath } from "../lib/permissions";

const baseNav = [
  { to: "/", label: "儀表板", icon: LayoutDashboard },
  { to: "/purchase", label: "買入登記", icon: Banknote },
  { to: "/sale", label: "售出錄入", icon: HandCoins },
  { to: "/receivables", label: "應收應付", icon: Users },
  { to: "/accounts", label: "帳務管理", icon: Landmark },
  { to: "/ledger", label: "現金流水", icon: ReceiptText },
  { to: "/inventory", label: "FIFO 庫存", icon: Boxes }
];

const adminNavItem = { to: "/admin", label: "管理後台", icon: Settings };

export function AppLayout() {
  const [open, setOpen] = React.useState(false);
  const { sessionUser } = useAppStore();
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
    if (location.pathname === "/account") return "帳務管理";
    if (location.pathname === "/admin") return adminNavItem.label;
    return nav.find((item) => item.to === location.pathname)?.label ?? "RMBsale";
  }, [location.pathname, nav]);

  const goToAccountTransfer = () => {
    openAccountTransferModal();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className={cn("fixed inset-y-0 left-0 z-40 w-64 border-r bg-slate-950 text-slate-100 lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <div>
            <p className="text-lg font-semibold">RMBsale</p>
            <p className="text-xs text-slate-400">金流記帳系統</p>
          </div>
          <Button className="lg:hidden" variant="ghost" size="icon" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className={cn("space-y-1 p-3", showAdminLink ? "pb-40" : "pb-28")}>
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)} className={({ isActive }) => cn("flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-300", isActive && "bg-primary text-white")}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 space-y-3 border-t border-white/10 p-4">
          {showAdminLink ? (
            <NavLink
              to={adminNavItem.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-300",
                  isActive && "bg-primary text-white"
                )
              }
            >
              <adminNavItem.icon className="h-4 w-4" />
              {adminNavItem.label}
            </NavLink>
          ) : null}
          <div>
            <Badge tone="muted" className="mb-2 bg-white/10 text-slate-200">{sessionLevel}</Badge>
            <p className="text-sm font-medium">{sessionUser.displayName}</p>
            <p className="text-xs text-slate-400">@{sessionUser.username}</p>
            <p className="text-xs text-slate-400">本機 demo 模式</p>
          </div>
        </div>
      </aside>
      {open ? <button className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-label="關閉選單" /> : null}
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
              <span className="max-[420px]:hidden">售出</span>
            </Button>
            ) : null}
            {hasPermission(sessionUser, "receivables") ? (
            <Button
              className="h-8 shrink-0 gap-1 whitespace-nowrap px-2 text-xs sm:gap-2 sm:px-3 sm:text-sm"
              variant="outline"
              size="sm"
              title="收帳"
              onClick={openSettlementModal}
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
              <span className="max-[420px]:hidden">收帳</span>
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
              <span className="max-[420px]:hidden">轉帳</span>
            </Button>
            ) : null}
            <Button className="hidden shrink-0 sm:inline-flex" variant="ghost" size="icon" title="登出 demo">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="min-w-0 overflow-x-hidden p-3 sm:p-4 lg:p-6">
          <PermissionRoute>
            <Outlet />
          </PermissionRoute>
        </main>
      </div>
    </div>
  );
}
