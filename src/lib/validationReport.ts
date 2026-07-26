import { reportGlobalError } from "../context/ErrorReporterContext";

export function reportValidationError(message: string, location: string, details?: unknown) {
  reportGlobalError(message, {
    title: "欄位檢查未通過",
    location,
    severity: "warning",
    details
  });
}
