import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, "..", "data");
const file = fs.readdirSync(dataDir).find((f) => f.endsWith(".xlsx"));
const wb = XLSX.readFile(path.join(dataDir, file), { cellDates: true });

function statsSheet(name, parseRow) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null });
  const dataRows = rows.slice(1).filter((r) => r?.[0]);
  const stats = {};
  for (const row of dataRows) {
    const key = parseRow(row);
    stats[key] = (stats[key] ?? 0) + 1;
  }
  return { total: dataRows.length, stats };
}

const asset = statsSheet("資產流向表", (r) => {
  const cat = String(r[1] ?? "").trim();
  if (!cat || cat.includes("持有") || cat === "日期") return "_meta";
  return cat || "_empty";
});

const customerSheets = ["柏草", "胡草", "芸草", "吳草", "蕭草"];
const custStats = {};
for (const s of customerSheets) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, defval: null });
  let sales = 0,
    settlements = 0,
    opening = 0;
  for (const row of rows.slice(2)) {
    if (!row?.[0]) continue;
    const rmb = row[1];
    const recv = row[6];
    if (rmb != null && Number(rmb) > 0) sales++;
    if (recv != null && Number(recv) > 0) settlements++;
    if (rmb == null && recv == null && row[7] != null) opening++;
  }
  custStats[s] = { rows: rows.length, sales, settlements, opening };
}

console.log(JSON.stringify({ asset, custStats, 俐草: statsSheet("俐草", (r) => (r[3] ? "花費" : r[1] ? "儲值" : "其他")) }, null, 2));
