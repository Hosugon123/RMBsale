import * as React from "react";
import { AlertTriangle, ClipboardCopy, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

const ERROR_EVENT = "rmbsale:report-error";

export type ErrorReportOptions = {
  title?: string;
  location?: string;
  details?: unknown;
  severity?: "warning" | "error";
};

type ErrorReport = {
  code: string;
  title: string;
  message: string;
  location: string;
  url: string;
  occurredAt: string;
  details?: string;
  stack?: string;
  severity: "warning" | "error";
};

type ErrorReporterContextValue = {
  reportError: (error: unknown, options?: ErrorReportOptions) => void;
};

const ErrorReporterContext = React.createContext<ErrorReporterContextValue | null>(null);

function buildErrorCode(now: Date) {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");
  return `ERR-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message || "系統發生未知錯誤",
      stack: error.stack
    };
  }
  if (typeof error === "string") return { message: error };
  if (error && typeof error === "object" && "message" in error) {
    return { message: String((error as { message?: unknown }).message ?? "系統發生未知錯誤") };
  }
  return { message: "系統發生未知錯誤", details: stringifyDetails(error) };
}

function stringifyDetails(details: unknown) {
  if (details == null) return undefined;
  if (typeof details === "string") return details;
  try {
    return JSON.stringify(
      details,
      (_key, value) => {
        if (value instanceof Error) {
          return { message: value.message, stack: value.stack };
        }
        return value;
      },
      2
    );
  } catch {
    return String(details);
  }
}

function getPageLocation() {
  if (typeof document === "undefined") return "未知頁面";
  const heading = document.querySelector("h1, h2")?.textContent?.trim();
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  return [heading, path].filter(Boolean).join(" / ") || "未知頁面";
}

function compactText(value: string | undefined | null, fallback = "未知位置") {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function describeInvalidField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return getPageLocation();
  const label = target.closest("label")?.textContent;
  const name =
    target.getAttribute("aria-label") ||
    target.getAttribute("name") ||
    target.getAttribute("placeholder") ||
    target.getAttribute("id");
  return `${getPageLocation()} / 欄位：${compactText(label || name, "未命名欄位")}`;
}

function createReport(error: unknown, options: ErrorReportOptions = {}): ErrorReport {
  const now = new Date();
  const normalized = normalizeError(error);
  const optionDetails = stringifyDetails(options.details);
  return {
    code: buildErrorCode(now),
    title: options.title ?? (options.severity === "warning" ? "操作未完成" : "系統警告"),
    message: compactText(normalized.message, "系統發生未知錯誤"),
    location: compactText(options.location, getPageLocation()),
    url: typeof window !== "undefined" ? window.location.href : "",
    occurredAt: now.toLocaleString("zh-TW", { hour12: false }),
    details: optionDetails ?? normalized.details,
    stack: normalized.stack,
    severity: options.severity ?? "error"
  };
}

function reportToWindow(error: unknown, options?: ErrorReportOptions) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ERROR_EVENT, { detail: { error, options } }));
}

export function reportGlobalError(error: unknown, options?: ErrorReportOptions) {
  reportToWindow(error, options);
}

export function useErrorReporter() {
  const context = React.useContext(ErrorReporterContext);
  if (context) return context;
  return { reportError: reportGlobalError };
}

export function ErrorReporterProvider({ children }: { children: React.ReactNode }) {
  const [report, setReport] = React.useState<ErrorReport | null>(null);
  const [copied, setCopied] = React.useState(false);
  const lastReportRef = React.useRef<{ key: string; time: number } | null>(null);

  const reportError = React.useCallback((error: unknown, options?: ErrorReportOptions) => {
    const next = createReport(error, options);
    const dedupeKey = `${next.message}|${next.location}`;
    const now = Date.now();
    if (lastReportRef.current?.key === dedupeKey && now - lastReportRef.current.time < 1200) return;
    lastReportRef.current = { key: dedupeKey, time: now };
    setCopied(false);
    setReport(next);
  }, []);

  React.useEffect(() => {
    const handleCustomError = (event: Event) => {
      const detail = (event as CustomEvent<{ error: unknown; options?: ErrorReportOptions }>).detail;
      reportError(detail?.error ?? "系統發生未知錯誤", detail?.options);
    };

    const handleWindowError = (event: ErrorEvent) => {
      reportError(event.error ?? event.message, {
        title: "系統執行錯誤",
        location: "全域 JavaScript 錯誤",
        details: {
          file: event.filename,
          line: event.lineno,
          column: event.colno
        }
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportError(event.reason, {
        title: "系統非同步錯誤",
        location: "未處理的背景操作"
      });
    };

    const handleInvalid = (event: Event) => {
      const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
      const message = target?.validationMessage || "欄位未填或格式不正確";
      reportError(message, {
        title: "欄位檢查未通過",
        location: describeInvalidField(event.target),
        severity: "warning",
        details: {
          fieldName: target?.name || target?.id || target?.getAttribute("aria-label") || null,
          value: target?.value ?? null
        }
      });
    };

    window.addEventListener(ERROR_EVENT, handleCustomError as EventListener);
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    document.addEventListener("invalid", handleInvalid, true);
    return () => {
      window.removeEventListener(ERROR_EVENT, handleCustomError as EventListener);
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      document.removeEventListener("invalid", handleInvalid, true);
    };
  }, [reportError]);

  const copyReport = async () => {
    if (!report) return;
    const text = [
      `錯誤代碼：${report.code}`,
      `標題：${report.title}`,
      `位置：${report.location}`,
      `訊息：${report.message}`,
      `時間：${report.occurredAt}`,
      `網址：${report.url}`,
      report.details ? `細節：${report.details}` : null,
      report.stack ? `堆疊：${report.stack}` : null
    ]
      .filter(Boolean)
      .join("\n");
    try {
      if (!navigator.clipboard?.writeText) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <ErrorReporterContext.Provider value={{ reportError }}>
      {children}
      {report ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="global-error-title"
        >
          <Card className="w-full max-w-lg overflow-hidden border-destructive/30">
            <CardHeader className="flex-row items-start justify-between gap-4 border-b p-4">
              <div className="flex min-w-0 items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="min-w-0">
                  <CardTitle id="global-error-title" className="leading-snug">
                    {report.title}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{report.code}</p>
                </div>
              </div>
              <Button aria-label="關閉錯誤彈窗" onClick={() => setReport(null)} size="icon" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 p-4 text-sm">
              <div className="rounded-md border border-destructive/25 bg-destructive/10 p-3 text-destructive">
                {report.message}
              </div>
              <div className="grid gap-2 rounded-md border bg-muted/20 p-3">
                <p>
                  <span className="font-semibold">錯誤位置：</span>
                  {report.location}
                </p>
                <p>
                  <span className="font-semibold">發生時間：</span>
                  {report.occurredAt}
                </p>
                <p className="break-all">
                  <span className="font-semibold">目前網址：</span>
                  {report.url}
                </p>
              </div>
              {report.details ? (
                <pre className="max-h-32 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
                  {report.details}
                </pre>
              ) : null}
              <p className="text-xs text-muted-foreground">
                請把這個彈窗截圖，或按下複製錯誤資訊後傳給系統管理員。
              </p>
              <div className="flex gap-2">
                <Button className="flex-1" type="button" onClick={copyReport}>
                  <ClipboardCopy className="h-4 w-4" />
                  {copied ? "已複製" : "複製錯誤資訊"}
                </Button>
                <Button className="flex-1" type="button" variant="outline" onClick={() => setReport(null)}>
                  關閉
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </ErrorReporterContext.Provider>
  );
}
