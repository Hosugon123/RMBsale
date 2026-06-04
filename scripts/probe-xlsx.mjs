import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, "..", "data");
const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".xlsx"));
if (!files.length) {
  console.error("No xlsx in data/");
  process.exit(1);
}
const filePath = path.join(dataDir, files[0]);
console.log("file:", files[0]);
const wb = XLSX.readFile(filePath, { cellDates: true });
const out = { file: files[0], sheets: {} };
for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  out.sheets[name] = { rowCount: rows.length, preview: rows.slice(0, 12).map((r) => (Array.isArray(r) ? r.slice(0, 15) : r)) };
}
fs.writeFileSync(path.join(root, "..", "data", "probe-preview.json"), JSON.stringify(out, null, 2), "utf8");
console.log("wrote data/probe-preview.json, sheets:", wb.SheetNames.join(", "));
