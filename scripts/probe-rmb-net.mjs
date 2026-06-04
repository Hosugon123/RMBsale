import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const root = path.dirname(fileURLToPath(import.meta.url));
const file = fs.readdirSync(path.join(root, "..", "data")).find((f) => f.endsWith(".xlsx"));
const wb = XLSX.readFile(path.join(root, "..", "data", file), { cellDates: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets["資產流向表"], { header: 1, defval: null });

const hi = rows.findIndex((r) => String(r?.[0] ?? "").includes("日期") && String(r?.[1] ?? "").trim() === "類別");
const net = {};
const add = (acc, amt) => {
  if (!acc) return;
  net[acc] = (net[acc] ?? 0) + amt;
};

for (const r of rows.slice(hi + 1)) {
  const cat = String(r?.[1] ?? "").trim();
  const rmb = Number(r?.[3]);
  if (!cat || !Number.isFinite(rmb)) {
    if (cat === "內轉") {
      const amt = Number(r?.[6] ?? r?.[7]);
      const out = r?.[8];
      const inn = r?.[9];
      if (out?.endsWith("草") && inn?.endsWith("草") && amt) {
        add(out, -amt);
        add(inn, amt);
      }
    }
    continue;
  }
  if (cat === "買入") add(r[9], rmb);
  if (cat === "售出") add(r[8], -rmb);
}

console.log("net from flow:", net);

const holdLabels = rows[4];
const holdVals = rows[5];
const hold = {};
for (let i = 1; i < (holdLabels?.length ?? 0); i++) {
  const label = holdLabels[i];
  if (typeof label === "string" && label.endsWith("草")) hold[label] = holdVals[i];
}
console.log("持有草 row:", hold);
