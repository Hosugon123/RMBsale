import { parseBusinessImportJson, summarizeBusinessImport, type BusinessDataImport } from "./dataImport";

/** 更新試算表匯入檔後請遞增，以觸發瀏覽器自動重新匯入。 */
export const XLSX_AUTO_IMPORT_VERSION = "20260604-v5";
export const XLSX_APPLIED_KEY = "rmbsale.xlsxImport.applied";
export const XLSX_IMPORT_NOTICE_KEY = "rmbsale.xlsxImport.notice";

export function isXlsxImportApplied() {
  return localStorage.getItem(XLSX_APPLIED_KEY) === XLSX_AUTO_IMPORT_VERSION;
}

export async function loadXlsxImportPayload(): Promise<BusinessDataImport | null> {
  const res = await fetch("/import-from-xlsx.json", { cache: "no-store" });
  if (!res.ok) return null;
  const raw = await res.text();
  const contentType = res.headers.get("content-type") ?? "";
  const trimmed = raw.trimStart();
  if (!contentType.includes("json") && !trimmed.startsWith("{")) return null;
  return parseBusinessImportJson(raw);
}

export function formatImportNotice(payload: BusinessDataImport) {
  const s = summarizeBusinessImport(payload);
  return `已載入試算表資料：帳戶 ${s.accounts}、客戶 ${s.customers}、買入 ${s.purchases}、售出 ${s.sales}、流水 ${s.ledger} 筆。`;
}
