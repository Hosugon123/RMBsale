import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handler as accounts } from "./accounts.js";
import { handler as adjustments } from "./adjustments.js";
import { handler as dashboard } from "./dashboard.js";
import { handler as customers } from "./customers.js";
import { handler as ledger } from "./ledger.js";
import { handler as purchases } from "./purchases.js";
import { handler as receivables } from "./receivables.js";
import { handler as sales } from "./sales.js";
import { handler as settlements } from "./settlements.js";
import { handler as transfers } from "./transfers.js";
import { handler as authLogin } from "./auth-login.js";
import { handler as authLogout } from "./auth-logout.js";
import { handler as authMe } from "./auth-me.js";
import { handler as adminUsers } from "./admin-users.js";
import { handler as adminChannels } from "./admin-channels.js";
import { handler as adminHolders } from "./admin-holders.js";
import { handler as adminAccounts } from "./admin-accounts.js";
import { handler as adminClearBusiness } from "./admin-clear-business.js";
import { handler as adminImport } from "./admin-import.js";
import { handler as adminAuditLogs } from "./admin-audit-logs.js";
import { handler as inventoryFifo } from "./inventory-fifo.js";
import { handler as reportsExportCsv } from "./reports-export-csv.js";
import { handler as reversals } from "./reversals.js";
import { handler as transactionReverse } from "./transaction-reverse.js";
import { handler as bootstrap } from "./bootstrap.js";
import { handler as holders } from "./holders.js";
import { handler as purchasesPay } from "./purchases-pay.js";

export type RouteHandler = (
  req: VercelRequest,
  res: VercelResponse,
) => Promise<unknown>;

export const routes: Record<string, RouteHandler> = {
  bootstrap,
  accounts,
  adjustments,
  dashboard,
  holders,
  "purchases/pay": purchasesPay,
  customers,
  ledger,
  purchases,
  receivables,
  sales,
  settlements,
  transfers,
  "auth/login": authLogin,
  "auth/logout": authLogout,
  "auth/me": authMe,
  "admin/users": adminUsers,
  "admin/channels": adminChannels,
  "admin/holders": adminHolders,
  "admin/accounts": adminAccounts,
  "admin/clear-business": adminClearBusiness,
  "admin/import": adminImport,
  "admin/audit-logs": adminAuditLogs,
  "inventory/fifo": inventoryFifo,
  "reports/export.csv": reportsExportCsv,
  reversals,
};

export const transactionReverseHandler = transactionReverse;
