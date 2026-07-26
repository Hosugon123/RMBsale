import * as React from "react";
import { reportGlobalError } from "../context/ErrorReporterContext";

type AppErrorBoundaryState = {
  crashed: boolean;
};

export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { crashed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportGlobalError(error, {
      title: "畫面顯示錯誤",
      location: "React 畫面渲染",
      details: { componentStack: info.componentStack }
    });
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center text-foreground">
          <div className="max-w-sm space-y-3">
            <h1 className="text-xl font-semibold">畫面發生錯誤</h1>
            <p className="text-sm text-muted-foreground">請將錯誤彈窗內容回報給系統管理員，並重新整理頁面。</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
