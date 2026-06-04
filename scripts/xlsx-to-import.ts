import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import {
  crossValidateCustomers,
  CUSTOMER_SHEETS,
  parseAssetFlowRows,
  parseSheetHoldings,
  parseCustomerSheetStats,
  replayAssetFlow,
  createImportBaseState,
  toBusinessExport,
  type ReplayLogEntry
} from "../src/lib/xlsxImport";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(scriptDir, "..");
const dataDir = path.join(projectRoot, "data");

function installLocalStorageMock() {
  const memory = new Map<string, string>();
  const store = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear(),
    key: (_index: number) => null,
    get length() {
      return memory.size;
    }
  };
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
}

function findWorkbookPath(): string {
  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".xlsx"));
  if (!files.length) throw new Error("data/ 內找不到 .xlsx 檔");
  return path.join(dataDir, files[0]);
}

function summarizeReplay(logs: ReplayLogEntry[]) {
  return {
    ok: logs.filter((l) => l.level === "OK").length,
    skip: logs.filter((l) => l.level === "SKIP").length,
    warn: logs.filter((l) => l.level === "WARN").length,
    skipped: logs.filter((l) => l.level === "SKIP")
  };
}

function main() {
  installLocalStorageMock();
  const workbookPath = findWorkbookPath();
  const wb = XLSX.readFile(workbookPath, { cellDates: true });
  const assetSheetRows = XLSX.utils.sheet_to_json(wb.Sheets["資產流向表"], { header: 1, defval: null });
  const holdings = parseSheetHoldings(assetSheetRows);
  const flowRows = parseAssetFlowRows(assetSheetRows);

  const sheetStats = CUSTOMER_SHEETS.filter((name) => wb.SheetNames.includes(name)).map((name) =>
    parseCustomerSheetStats(name, XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null }))
  );

  const state = createImportBaseState();
  const replayLogs = replayAssetFlow(state, flowRows, holdings);
  const validation = crossValidateCustomers(state, flowRows, sheetStats);
  const payload = toBusinessExport(state);

  const report = {
    sourceFile: path.basename(workbookPath),
    generatedAt: new Date().toISOString(),
    holdings,
    flow: {
      total: flowRows.length,
      byCategory: flowRows.reduce(
        (acc, row) => {
          acc[row.category] = (acc[row.category] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      )
    },
    replay: summarizeReplay(replayLogs),
    validation: {
      ok: validation.filter((c) => c.status === "OK").length,
      warn: validation.filter((c) => c.status === "WARN").length,
      checks: validation
    },
    exportCounts: {
      holders: payload.holders?.length ?? 0,
      accounts: payload.accounts?.length ?? 0,
      customers: payload.customers?.length ?? 0,
      channels: payload.channels?.length ?? 0,
      purchases: payload.purchases?.length ?? 0,
      sales: payload.sales?.length ?? 0,
      ledger: payload.ledger?.length ?? 0
    }
  };

  const importJson = JSON.stringify(payload, null, 2);
  fs.writeFileSync(path.join(dataDir, "import-from-xlsx.json"), importJson, "utf8");
  fs.writeFileSync(path.join(dataDir, "import-validation-report.json"), JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(path.join(projectRoot, "public", "import-from-xlsx.json"), importJson, "utf8");

  console.log("來源:", workbookPath);
  console.log("流向表交易:", flowRows.length, report.flow.byCategory);
  console.log("重播:", report.replay);
  console.log("驗證 OK/WARN:", report.validation.ok, report.validation.warn);
  console.log("輸出:", path.join(dataDir, "import-from-xlsx.json"));
  console.log("報告:", path.join(dataDir, "import-validation-report.json"));
}

main();
