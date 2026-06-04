import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const root = path.dirname(fileURLToPath(import.meta.url));
const file = fs.readdirSync(path.join(root, "..", "data")).find((f) => f.endsWith(".xlsx"));
const wb = XLSX.readFile(path.join(root, "..", "data", file), { cellDates: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets["資產流向表"], { header: 1, defval: null });

function findHeaderIndex() {
  for (let i = 0; i < rows.length; i++) {
    const b = String(rows[i]?.[1] ?? "").trim();
    if (b === "類別" && String(rows[i]?.[0] ?? "").includes("日期")) return i;
  }
  return -1;
}

const hi = findHeaderIndex();
const data = rows.slice(hi + 1).filter((r) => r?.[0] && String(r[1] ?? "").trim());

const byCat = {};
for (const r of data) {
  const cat = String(r[1]).trim();
  if (!byCat[cat]) byCat[cat] = [];
  if (byCat[cat].length < 2) byCat[cat].push(r);
}

console.log(JSON.stringify({ headerIndex: hi, categories: Object.keys(byCat).sort(), samples: byCat }, null, 2));
