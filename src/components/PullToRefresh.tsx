import * as React from "react";
import { cn } from "../lib/utils";

const PULL_THRESHOLD = 72;
const REFRESH_HOLD = 56;
const MAX_PULL = 132;
const RING_RADIUS = 11;
const RING_SIZE = 28;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

type PullToRefreshProps = {
  onRefresh: () => void | Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
};

function isAtScrollTop() {
  return window.scrollY <= 0 && document.documentElement.scrollTop <= 0;
}

function pullOffset(deltaY: number) {
  if (deltaY <= 0) return 0;
  const eased = deltaY * (1 - Math.exp(-deltaY / 180));
  return Math.min(eased * 0.52, MAX_PULL);
}

function ProgressRing({
  progress,
  spinning,
  error
}: {
  progress: number;
  spinning: boolean;
  error: boolean;
}) {
  const strokeDashoffset = CIRCUMFERENCE * (1 - Math.min(progress, 1));

  return (
    <div
      className={cn(
        "relative flex h-7 w-7 items-center justify-center",
        spinning && "animate-[spin_0.85s_linear_infinite]"
      )}
    >
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          className="stroke-border/80"
          strokeWidth="2"
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          className={cn(
            "stroke-primary transition-[stroke-dashoffset] duration-150",
            error && "stroke-destructive",
            progress >= 1 && !spinning && "stroke-primary/90"
          )}
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={spinning ? CIRCUMFERENCE * 0.22 : strokeDashoffset}
        />
      </svg>
      {progress >= 1 && !spinning && !error ? (
        <span className="absolute h-1.5 w-1.5 rounded-full bg-primary/80" />
      ) : null}
    </div>
  );
}

export function PullToRefresh({ onRefresh, children, disabled = false }: PullToRefreshProps) {
  const [pull, setPull] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
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
    setIsDragging(false);
  }, []);

  const runRefresh = React.useCallback(async () => {
    if (refreshingRef.current || disabled) return;
    setRefreshing(true);
    setError("");
    pullRef.current = REFRESH_HOLD;
    setPull(REFRESH_HOLD);
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
      setIsDragging(true);
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
      const nextPull = pullOffset(deltaY);
      pullRef.current = nextPull;
      setPull(nextPull);
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      setIsDragging(false);
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

  const displayOffset = refreshing ? REFRESH_HOLD : pull;
  const progress = Math.min(pull / PULL_THRESHOLD, 1);
  const showIndicator = displayOffset > 4 || refreshing;
  const label = error
    ? error
    : refreshing
      ? "更新中"
      : progress >= 1
        ? "放開重整"
        : progress > 0.15
          ? "下拉重整"
          : "";

  return (
    <div
      className={cn(
        "will-change-transform",
        !isDragging && "transition-transform duration-[420ms] ease-[cubic-bezier(0.33,1,0.68,1)]"
      )}
      style={{ transform: displayOffset > 0 ? `translateY(${displayOffset}px)` : undefined }}
    >
      <div
        aria-live="polite"
        className={cn(
          "pointer-events-none flex flex-col items-center justify-end overflow-hidden transition-all duration-200",
          showIndicator ? "mb-1 opacity-100" : "mb-0 h-0 opacity-0"
        )}
        style={{ height: showIndicator ? Math.min(displayOffset, 52) : 0 }}
      >
        <ProgressRing progress={refreshing ? 1 : progress} spinning={refreshing} error={Boolean(error)} />
        {label ? (
          <p
            className={cn(
              "mt-1.5 text-[11px] font-medium tracking-wide transition-opacity duration-200",
              error ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {label}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
