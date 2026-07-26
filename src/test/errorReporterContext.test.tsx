import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ErrorReporterProvider, reportGlobalError } from "../context/ErrorReporterContext";

afterEach(() => {
  cleanup();
});

describe("ErrorReporterProvider", () => {
  it("does not report ordinary red text when a form is submitted", async () => {
    render(
      <ErrorReporterProvider>
        <form onSubmit={(event) => event.preventDefault()}>
          <p className="text-sm text-destructive">只是提醒，不是錯誤</p>
          <button type="submit">送出</button>
        </form>
      </ErrorReporterProvider>
    );

    fireEvent.submit(screen.getByRole("button", { name: "送出" }).closest("form")!);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("reports real browser field validation errors", async () => {
    render(
      <ErrorReporterProvider>
        <form>
          <input aria-label="金額" required />
        </form>
      </ErrorReporterProvider>
    );

    fireEvent.invalid(screen.getByLabelText("金額"));

    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("reports explicitly raised application errors", async () => {
    render(
      <ErrorReporterProvider>
        <div>ready</div>
      </ErrorReporterProvider>
    );

    reportGlobalError("帳戶餘額不足", { location: "測試 API" });

    expect(await screen.findByText("帳戶餘額不足")).toBeTruthy();
  });
});
