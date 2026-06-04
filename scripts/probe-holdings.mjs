import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const root = path.dirname(fileURLToPath(import.meta.url));
const file = fs.readdirSync(path.join(root, "..", "data")).find((f) => f.endsWith(".xlsx"));
const wb = XLSX.readFile(path.join(root, "..", "data", file), { cellDates: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets["資產流向表"], { header: 1, defval: null });

for (let i = 0; i < 12; i++) {
  console.log(i, JSON.stringify(rows[i]?.slice(0, 11)));
}
