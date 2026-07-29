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
  { to: "/accounts", label: "帳務管理", icon: Landmark },
  { to: "/ledger", label: "現金流水", icon: ReceiptText },
  { to: "/receivables", label: "應收應付", icon: Users },
  { to: "/special-client-wallet", label: "儲值代付", icon: Wallet },
  { to: "/purchase", label: "買入登記", icon: Banknote },
  { to: "/sale", label: "售出錄入", icon: HandCoins },
  { to: "/inventory", label: "FIFO 庫存", icon: Boxes }
];

const adminNavItem = { to: "/admin", label: "管理後台", icon: Settings };
const MOBILE_BREAKPOINT_PX = 1024;
const SIDEBAR_WIDTH_PX = 256;
const SIDEBAR_SWIPE_THRESHOLD_PX = 72;
const SIDEBAR_SWIPE_VERTICAL_CANCEL_PX = 22;
const SIDEBAR_SWIPE_ACTIVATE_PX = 8;

type SidebarSwipeState = {
  x: number;
  y: number;
  mode: "open" | "close";
  active: boolean;
};

function clampSidebarOffset(value: number) {
  return Math.max(0, Math.min(SIDEBAR_WIDTH_PX, value));
}

export function AppLayout() {
  const [open, setOpen] = React.useState(false);
  const sidebarSwipeRef = React.useRef<SidebarSwipeState | null>(null);
  const swipeOffsetRef = React.useRef<number | null>(null);
  const [swipeOffset, setSwipeOffset] = React.useState<number | null>(null);
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

  const setSwipeOffsetValue = React.useCallback((value: number | null) => {
    swipeOffsetRef.current = value;
    setSwipeOffset(value);
  }, []);

  const isMobileLayout = React.useCallback(() => window.innerWidth < MOBILE_BREAKPOINT_PX, []);

  const beginSidebarSwipe = React.useCallback(
    (event: React.TouchEvent, mode: "open" | "close") => {
      if (!isMobileLayout() || event.touches.length !== 1) {
        sidebarSwipeRef.current = null;
        return;
      }
      const touch = event.touches[0];
      sidebarSwipeRef.current = { x: touch.clientX, y: touch.clientY, mode, active: false };
      setSwipeOffsetValue(mode === "close" ? SIDEBAR_WIDTH_PX : 0);
    },
    [isMobileLayout, setSwipeOffsetValue]
  );

  const updateSidebarSwipe = React.useCallback(
    (event: React.TouchEvent) => {
      const start = sidebarSwipeRef.current;
      if (!start || event.touches.length !== 1 || !isMobileLayout()) return;

      const touch = event.touches[0];
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;

      if (!start.active) {
        if (Math.abs(deltaY) > SIDEBAR_SWIPE_VERTICAL_CANCEL_PX && Math.abs(deltaY) > Math.abs(deltaX)) {
          sidebarSwipeRef.current = null;
          setSwipeOffsetValue(null);
          return;
        }
        if (Math.abs(deltaX) < SIDEBAR_SWIPE_ACTIVATE_PX) return;
        if ((start.mode === "open" && deltaX < 0) || (start.mode === "close" && deltaX > 0)) {
          sidebarSwipeRef.current = null;
          setSwipeOffsetValue(null);
          return;
        }
        sidebarSwipeRef.current = { ...start, active: true };
      }

      event.preventDefault();
      const nextOffset =
        start.mode === "open"
          ? clampSidebarOffset(deltaX)
          : clampSidebarOffset(SIDEBAR_WIDTH_PX + deltaX);
      setSwipeOffsetValue(nextOffset);
    },
    [isMobileLayout, setSwipeOffsetValue]
  );

  const finishSidebarSwipe = React.useCallback(() => {
    const start = sidebarSwipeRef.current;
    const currentOffset = swipeOffsetRef.current;
    sidebarSwipeRef.current = null;
    setSwipeOffsetValue(null);
    if (!start || currentOffset == null) return;

    if (start.mode === "open") {
      setOpen(currentOffset >= SIDEBAR_SWIPE_THRESHOLD_PX);
      return;
    }

    setOpen(currentOffset >= SIDEBAR_WIDTH_PX - SIDEBAR_SWIPE_THRESHOLD_PX);
  }, [setSwipeOffsetValue]);

  const cancelSidebarSwipe = React.useCallback(() => {
    sidebarSwipeRef.current = null;
    setSwipeOffsetValue(null);
  }, [setSwipeOffsetValue]);

  const effectiveSidebarOffset = swipeOffset ?? (open ? SIDEBAR_WIDTH_PX : 0);
  const sidebarProgress = Math.max(0, Math.min(1, effectiveSidebarOffset / SIDEBAR_WIDTH_PX));
  const sidebarStyle =
    swipeOffset !== null || open
      ? { transform: `translate3d(${effectiveSidebarOffset - SIDEBAR_WIDTH_PX}px, 0, 0)` }
      : undefined;
  const overlayVisible = open || swipeOffset !== null;
  const overlayOpacity = open ? 0.5 : Math.min(0.45, sidebarProgress * 0.45);

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ overscrollBehaviorX: "contain" }}>
      {overlayVisible ? (
        <button
          type="button"
          className={cn(
            "fixed inset-0 z-40 bg-black transition-opacity duration-200 lg:hidden",
            swipeOffset !== null && "pointer-events-none"
          )}
          style={{ opacity: overlayOpacity }}
          onClick={() => setOpen(false)}
          aria-label="關閉選單"
        />
      ) : null}
      {!open ? (
        <div
          aria-hidden="true"
          className="fixed inset-y-0 left-0 z-30 w-8 touch-pan-y lg:hidden"
          style={{ touchAction: "pan-y" }}
          onTouchStart={(event) => beginSidebarSwipe(event, "open")}
          onTouchMove={updateSidebarSwipe}
          onTouchEnd={finishSidebarSwipe}
          onTouchCancel={cancelSidebarSwipe}
        >
          <div
            className={cn(
              "absolute left-1 top-1/2 h-16 w-1 -translate-y-1/2 rounded-full bg-primary/40 shadow-[0_0_18px_rgba(59,130,246,0.35)] transition-opacity duration-200",
              swipeOffset !== null ? "opacity-100" : "opacity-35"
            )}
          />
        </div>
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r shadow-xl will-change-transform",
          "border-slate-200 bg-white text-slate-900",
          "dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100",
          swipeOffset === null && "transition-transform duration-300 ease-out",
          "lg:z-40 lg:translate-x-0 lg:shadow-none",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        style={sidebarStyle}
        onTouchStart={(event) => {
          if (open) beginSidebarSwipe(event, "close");
        }}
        onTouchMove={updateSidebarSwipe}
        onTouchEnd={finishSidebarSwipe}
        onTouchCancel={cancelSidebarSwipe}
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
