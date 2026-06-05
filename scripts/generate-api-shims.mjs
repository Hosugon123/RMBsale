import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const entries = [
  ["bootstrap", "bootstrap"],
  ["accounts", "accounts"],
  ["adjustments", "adjustments"],
  ["dashboard", "dashboard"],
  ["holders", "holders"],
  ["customers", "customers"],
  ["ledger", "ledger"],
  ["purchases", "purchases"],
  ["receivables", "receivables"],
  ["sales", "sales"],
  ["settlements", "settlements"],
  ["transfers", "transfers"],
  ["purchases/pay", "purchases-pay"],
  ["auth/login", "auth-login"],
  ["auth/logout", "auth-logout"],
  ["auth/me", "auth-me"],
  ["admin/users", "admin-users"],
  ["admin/channels", "admin-channels"],
  ["admin/holders", "admin-holders"],
  ["admin/accounts", "admin-accounts"],
  ["admin/clear-business", "admin-clear-business"],
  ["admin/import", "admin-import"],
  ["admin/audit-logs", "admin-audit-logs"],
  ["inventory/fifo", "inventory-fifo"],
  ["reports/export.csv", "reports-export-csv"]
];

const root = "api";

for (const [routePath, handler] of entries) {
  const depth = routePath.split("/").length - 1;
  const importPrefix = depth === 0 ? "./" : "../".repeat(depth);
  const filePath = join(root, `${routePath}.ts`);
  const content = `import { handler } from "${importPrefix}_routes/${handler}.js";\nexport default handler;\n`;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
  console.log(`wrote ${filePath}`);
}

const reversePath = join(root, "transactions/[id]/reverse.ts");
const reverseContent = `import { handler } from "../../_routes/transaction-reverse.js";\nexport default handler;\n`;
mkdirSync(dirname(reversePath), { recursive: true });
writeFileSync(reversePath, reverseContent, "utf8");
console.log(`wrote ${reversePath}`);
