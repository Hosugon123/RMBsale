import * as React from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "../lib/utils";

const PULL_THRESHOLD = 72;
const MAX_PULL = 128;

type PullToRefreshProps = {
  onRefresh: () => void | Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
};

function isAtScrollTop() {
  return window.scrollY <= 0 && document.documentElement.scrollTop <= 0;
}

export function PullToRefresh({ onRefresh, children, disabled = false }: PullToRefreshProps) {
  const [pull, setPull] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState("");
  const pullRef = React.useRef(0);
  const startYRef = React.useRef(0);
  const startXRef = React.useRef(0);
  const pullingRef = React.useRef(false);
  const refreshingRef = React.useRef(false);

  React.useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  const resetPull = React.useCallback(() => {
    pullRef.current = 0;
    setPull(0);
    pullingRef.current = false;
  }, []);

  const runRefresh = React.useCallback(async () => {
    if (refreshingRef.current || disabled) return;
    setRefreshing(true);
    setError("");
    try {
      await Promise.resolve(onRefresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "重整失敗");
      window.setTimeout(() => setError(""), 2500);
    } finally {
      setRefreshing(false);
      resetPull();
    }
  }, [disabled, onRefresh, resetPull]);

  React.useEffect(() => {
    if (disabled) return;

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || !isAtScrollTop() || event.touches.length !== 1) return;
      const target = event.target;
      if (target instanceof Element && target.closest(".fixed.inset-0")) return;
      startYRef.current = event.touches[0].clientY;
      startXRef.current = event.touches[0].clientX;
      pullingRef.current = true;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pullingRef.current || refreshingRef.current || event.touches.length !== 1) return;
      if (!isAtScrollTop()) {
        resetPull();
        return;
      }

      const touch = event.touches[0];
      const deltaY = touch.clientY - startYRef.current;
      const deltaX = touch.clientX - startXRef.current;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        resetPull();
        return;
      }

      if (deltaY <= 0) {
        resetPull();
        return;
      }

      event.preventDefault();
      const nextPull = Math.min(deltaY * 0.55, MAX_PULL);
      pullRef.current = nextPull;
      setPull(nextPull);
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) return;
      const shouldRefresh = pullRef.current >= PULL_THRESHOLD;
      if (shouldRefresh) {
        void runRefresh();
      } else {
        resetPull();
      }
    };

    const onTouchCancel = () => {
      resetPull();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchCancel);

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [disabled, resetPull, runRefresh]);

  const progress = Math.min(pull / PULL_THRESHOLD, 1);
  const showIndicator = pull > 0 || refreshing;

  return (
    <>
      <div
        aria-hidden={!showIndicator}
        className={cn(
          "pointer-events-none fixed left-0 right-0 z-30 flex justify-center transition-opacity duration-200 lg:left-64",
          showIndicator ? "opacity-100" : "opacity-0"
        )}
        style={{ top: "4rem" }}
      >
        <div
          className="flex items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur"
          style={{
            transform: `translateY(${refreshing ? 8 : Math.max(pull - 24, 0)}px)`
          }}
        >
          <RefreshCw
            className={cn("h-4 w-4 text-primary", (refreshing || progress >= 1) && "animate-spin")}
            style={!refreshing ? { transform: `rotate(${progress * 180}deg)` } : undefined}
          />
          <span>
            {error ? error : refreshing ? "重整中…" : progress >= 1 ? "放開即可重整" : "下拉重整"}
          </span>
        </div>
      </div>
      <div
        style={{
          transform: refreshing ? undefined : pull > 0 ? `translateY(${pull * 0.35}px)` : undefined,
          transition: pull > 0 || refreshing ? undefined : "transform 200ms ease-out"
        }}
      >
        {children}
      </div>
    </>
  );
}
