import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const root = path.dirname(fileURLToPath(import.meta.url));
const file = fs.readdirSync(path.join(root, "..", "data")).find((f) => f.endsWith(".xlsx"));
const wb = XLSX.readFile(path.join(root, "..", "data", file), { cellDates: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets["資產流向表"], { header: 1, defval: null });
const buys = rows.filter((r) => String(r?.[1] ?? "").trim() === "買入");
const accounts = new Set();
for (const r of rows) {
  if (r?.[8]) accounts.add(String(r[8]).trim());
  if (r?.[9]) accounts.add(String(r[9]).trim());
}
console.log(
  JSON.stringify(
    {
      buyCount: buys.length,
      vendors: [...new Set(buys.map((r) => String(r[2] ?? "").trim()))].sort(),
      buySamples: buys.slice(0, 5).map((r) => ({
        date: r[0],
        vendor: r[2],
        rmb: r[3],
        rate: r[4],
        twd: r[6],
        out: r[8],
        in: r[9],
        note: r[10]
      })),
      accounts: [...accounts].sort()
    },
    null,
    2
  )
);
